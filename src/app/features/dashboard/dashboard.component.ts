import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import Chart from 'chart.js/auto';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

interface MemberMoney { id: string; name: string; given: number; used: number; left: number; }
interface EntryPerson { name: string; amount: number; }
interface EntryPreview { id: string; date: string; remarks: string; items: EntryPerson[]; total: number; }

@Component({
  selector: 'app-dashboard',
  imports: UI_IMPORTS,
  templateUrl: './dashboard.component.html',
  styleUrls: ['../../shared/page.scss', './dashboard.component.scss']
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  rows = signal<MemberMoney[]>([]);
  members = signal<{ id: string; name: string }[]>([]);
  previewRows = signal<EntryPreview[]>([]);
  memberUsed = signal<{ name: string; used: number }[]>([]);
  managerName = signal('');
  collectedTotal = signal(0);
  loading = signal(true);

  @ViewChild('spendCanvas', { static: true }) spendCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('shareCanvas', { static: true }) shareCanvas?: ElementRef<HTMLCanvasElement>;
  private spendChart?: Chart;
  private shareChart?: Chart;

  totalGiven = () => this.rows().reduce((sum, row) => sum + row.given, 0);
  totalUsed = () => this.rows().reduce((sum, row) => sum + row.used, 0);
  totalLeft = () => this.rows().reduce((sum, row) => sum + row.left, 0);

  constructor(
    private supabase: SupabaseService,
    private message: MessageService,
    private router: Router
  ) {
    void this.load();
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.spendChart?.destroy();
    this.shareChart?.destroy();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [{ data: members }, { data: settings }, { data: month }] = await Promise.all([
        this.supabase.client.from('members').select('id,name').eq('status', 'active').order('name'),
        this.supabase.client.from('settings').select('manager_name').eq('id', 1).maybeSingle(),
        this.supabase.client.from('months').select('id').eq('status', 'open').order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle()
      ]);
      const monthId = month?.id;
      if (!month) this.notifyNoOpenMonth();
      const [{ data: balances }, { data: collections }, { data: entryItems }, { data: entries }] = monthId
        ? await Promise.all([
            this.supabase.client.from('member_month_balances').select('member_id,opening_balance').eq('month_id', monthId),
            this.supabase.client.from('collections').select('member_id,amount').eq('month_id', monthId),
            this.supabase.client.from('entry_items').select('member_id,amount,daily_entries!inner(month_id)').eq('daily_entries.month_id', monthId),
            this.supabase.client.from('daily_entries').select('id,entry_date,total_cost,remarks,entry_items(member_id,amount)').eq('month_id', monthId).order('entry_date', { ascending: false }).limit(25)
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
      const activeMembers = (members ?? []) as { id: string; name: string }[];
      this.members.set(activeMembers);
      this.managerName.set(settings?.manager_name ?? '');
      this.collectedTotal.set((collections ?? []).reduce((sum, item) => sum + Number(item.amount), 0));

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

      this.memberUsed.set(activeMembers
        .map((member) => ({ name: member.name, used: used.get(member.id) ?? 0 }))
        .filter((member) => member.used > 0)
        .sort((a, b) => b.used - a.used));

      const nameMap = new Map(activeMembers.map((member) => [member.id, member.name]));
      this.previewRows.set((entries ?? []).map((entry: any) => {
        const personMap = new Map<string, number>();
        for (const item of entry.entry_items ?? []) personMap.set(item.member_id, (personMap.get(item.member_id) ?? 0) + Number(item.amount));
        const items = Array.from(personMap.entries())
          .map(([memberId, amount]) => ({ name: nameMap.get(memberId) ?? 'Member', amount }))
          .sort((a, b) => b.amount - a.amount);
        return { id: entry.id, date: this.formatDate(entry.entry_date), remarks: entry.remarks ?? '', items, total: Number(entry.total_cost ?? 0) };
      }));

      this.renderCharts();
    } finally {
      this.loading.set(false);
    }
  }

  private renderCharts(): void {
    if (this.spendCanvas) {
      this.spendChart?.destroy();

      const recent = [...this.previewRows()].slice(0, 10).reverse();
      const spendLabels = recent.map((entry) => entry.date);
      const spendValues = recent.map((entry) => entry.total);

      this.spendChart = new Chart(this.spendCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels: spendLabels,
          datasets: [
            {
              data: spendValues,
              backgroundColor: spendValues.map(() => 'rgba(255,107,0,0.75)'),
              hoverBackgroundColor: 'rgba(255,169,77,0.95)',
              borderRadius: 10,
              borderSkipped: false,
              maxBarThickness: 38
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(31,41,55,0.9)',
              padding: 12,
              cornerRadius: 12,
              displayColors: false,
              callbacks: { label: (context) => ` ${Number(context.raw).toFixed(2)}` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.45)' }, ticks: { color: '#9ca3af', font: { size: 11 } } }
          }
        }
      });
    }

    if (this.shareCanvas && this.memberUsed().length) {
      this.shareChart?.destroy();

      const data = this.memberUsed().map((member) => member.used);
      const palette = ['#ff6b00', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#a855f7', '#f97316'];
      const total = data.reduce((sum, value) => sum + value, 0);

      this.shareChart = new Chart(this.shareCanvas.nativeElement, {
        type: 'doughnut',
        data: {
          labels: this.memberUsed().map((member) => member.name),
          datasets: [
            {
              data,
              backgroundColor: data.map((_, index) => palette[index % palette.length]),
              borderColor: '#fff',
              borderWidth: 2,
              hoverOffset: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#6b7280', font: { size: 12 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 }
            },
            tooltip: {
              backgroundColor: 'rgba(31,41,55,0.9)',
              padding: 12,
              cornerRadius: 12,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const value = Number(context.raw);
                  const pct = total ? (value / total) * 100 : 0;
                  return ` ${value.toFixed(2)} (${pct.toFixed(1)}%)`;
                }
              }
            }
          }
        }
      });
    }
  }

  initials(name?: string): string {
    if (!name) return '';
    return name.split(' ').filter((word) => word.length).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  }

  goTo(path: string): void {
    void this.router.navigateByUrl(path);
  }

  private notifyNoOpenMonth(): void {
    this.message.add({
      key: 'no-month',
      severity: 'warn',
      summary: 'No open month',
      detail: 'Create a new month to start recording.',
      sticky: true
    });
  }

  private formatDate(value: string): string {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
