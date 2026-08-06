import { Component, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

interface MemberMoney { id: string; name: string; given: number; used: number; left: number; }
interface EntryPreview { id: string; date: string; remarks: string; values: Record<string, number>; total: number; }

@Component({
  selector: 'app-dashboard',
  imports: UI_IMPORTS,
  templateUrl: './dashboard.component.html',
  styleUrls: ['../../shared/page.scss', './dashboard.component.scss']
})
export class DashboardComponent {
  rows = signal<MemberMoney[]>([]);
  members = signal<{ id: string; name: string }[]>([]);
  previewRows = signal<EntryPreview[]>([]);
  managerName = signal('');
  columns = ['name', 'given', 'left'];
  blankRows = signal(Array.from({ length: 20 }, (_, index) => index));
  totalGiven = () => this.rows().reduce((sum, row) => sum + row.given, 0);
  totalUsed = () => this.rows().reduce((sum, row) => sum + row.used, 0);
  totalLeft = () => this.rows().reduce((sum, row) => sum + row.left, 0);
  memberUsed = (memberId: string) => this.previewRows().reduce((sum, row) => sum + (row.values[memberId] ?? 0), 0);

  constructor(private supabase: SupabaseService, private snack: MatSnackBar, private router: Router) { void this.load(); }

  async load(): Promise<void> {
    const [{ data: members }, { data: settings }, { data: month }] = await Promise.all([
      this.supabase.client.from('members').select('id,name').eq('status', 'active').order('name'),
      this.supabase.client.from('settings').select('manager_name').eq('id', 1).maybeSingle(),
      this.supabase.client.from('months').select('id').eq('status', 'open').order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle()
    ]);
    const monthId = month?.id;
    if (!month) this.notifyNoOpenMonth();
    const [{ data: balances }, { data: collections }, { data: entryItems }, { data: entries }] = monthId ? await Promise.all([
      this.supabase.client.from('member_month_balances').select('member_id,opening_balance').eq('month_id', monthId),
      this.supabase.client.from('collections').select('member_id,amount').eq('month_id', monthId),
      this.supabase.client.from('entry_items').select('member_id,amount,daily_entries!inner(month_id)').eq('daily_entries.month_id', monthId),
      this.supabase.client.from('daily_entries').select('id,entry_date,total_cost,remarks,entry_items(member_id,amount)').eq('month_id', monthId).order('entry_date', { ascending: false }).limit(25)
    ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
    const activeMembers = (members ?? []) as { id: string; name: string }[];
    this.members.set(activeMembers);
    this.managerName.set(settings?.manager_name ?? '');

    const opening = new Map<string, number>();
    const given = new Map<string, number>();
    const used = new Map<string, number>();
    for (const item of balances ?? []) opening.set(item.member_id, Number(item.opening_balance));
    for (const item of collections ?? []) given.set(item.member_id, (given.get(item.member_id) ?? 0) + Number(item.amount));
    for (const item of entryItems ?? []) used.set(item.member_id, (used.get(item.member_id) ?? 0) + Number(item.amount));
    this.rows.set(activeMembers.map((member) => {
      const memberGiven = (opening.get(member.id) ?? 0) + (given.get(member.id) ?? 0);
      const memberUsed = used.get(member.id) ?? 0;
      return { id: member.id, name: member.name, given: memberGiven, used: memberUsed, left: memberGiven - memberUsed };
    }));

    this.previewRows.set((entries ?? []).map((entry: any) => {
      const values: Record<string, number> = {};
      for (const item of entry.entry_items ?? []) values[item.member_id] = (values[item.member_id] ?? 0) + Number(item.amount);
      return { id: entry.id, date: this.formatDate(entry.entry_date), remarks: entry.remarks ?? '', values, total: Number(entry.total_cost ?? 0) };
    }));
  }

  shortName(name: string): string {
    return name.replace(/\s+Bhai$/i, '');
  }

  private notifyNoOpenMonth(): void {
    const ref = this.snack.open('No open month found. Create a new month to start recording.', 'Create Month', { duration: 8000, panelClass: ['app-toast'] });
    ref.onAction().subscribe(() => void this.router.navigateByUrl('/months'));
  }

  private formatDate(value: string): string {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
