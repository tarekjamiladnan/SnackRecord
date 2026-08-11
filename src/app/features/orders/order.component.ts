import { Component, OnDestroy, computed, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Member, Order } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

interface OrderRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

@Component({
  selector: 'app-order',
  imports: UI_IMPORTS,
  templateUrl: './order.component.html',
  styleUrls: ['../../shared/page.scss', './orders.component.scss']
})
export class OrderComponent implements OnDestroy {
  private readonly ORDER_CUTOFF = '16:20';
  orderText = '';
  order = signal<Order | null>(null);
  member = signal<Member | null>(null);
  settings = signal<{ min_balance_enabled: boolean; min_balance_amount: number } | null>(null);
  request = signal<OrderRequest | null>(null);
  loading = signal(true);
  saving = signal(false);
  today = this.toIsoDate(new Date());
  now = signal(new Date());
  private timer = setInterval(() => this.now.set(new Date()), 30000);

  afterCutoff = computed(() => {
    const date = this.now();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}` >= this.ORDER_CUTOFF;
  });
  isAdmin = () => this.auth.profile()?.role === 'admin';
  isClosed = () => this.afterCutoff() && this.request()?.status !== 'approved';
  remainingChars = () => 500 - this.orderText.length;

  constructor(private auth: SupabaseService, private message: MessageService) {
    void this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const userId = this.auth.user()?.id;
      const email = this.auth.profile()?.email;
      const [{ data: member }, { data: settings }] = await Promise.all([
        this.auth.client.from('members').select('*').or(`user_id.eq.${userId},email.eq.${email}`).eq('status', 'active').limit(1).maybeSingle(),
        this.auth.client.from('settings').select('min_balance_enabled,min_balance_amount').eq('id', 1).maybeSingle()
      ]);
      this.member.set((member as Member) ?? null);
      this.settings.set(settings ? { min_balance_enabled: !!settings.min_balance_enabled, min_balance_amount: Number(settings.min_balance_amount ?? 20) } : null);
      if (member) {
        const [orderResult, requestResult] = await Promise.all([
          this.auth.client.from('orders').select('*').eq('member_id', member.id).eq('order_date', this.today).maybeSingle(),
          this.auth.client.from('order_requests').select('id,status').eq('member_id', member.id).eq('request_date', this.today).maybeSingle()
        ]);
        this.order.set((orderResult.data as Order) ?? null);
        this.orderText = orderResult.data?.order_text ?? '';
        this.request.set((requestResult.data as OrderRequest) ?? null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const member = this.member();
    const text = this.orderText.trim();
    if (!member || !text) return;
    if (this.isClosed()) {
      this.message.add({
        severity: 'warn',
        summary: 'Order closed',
        detail: 'Ordering closed at 4:20 PM. Request permission from the admin to place an order.'
      });
      return;
    }
    this.saving.set(true);
    try {
      if (await this.blockedByMinimumBalance(member.id)) return;
      const { data, error } = await this.auth.client
        .from('orders')
        .upsert({ member_id: member.id, order_date: this.today, order_text: text }, { onConflict: 'member_id,order_date' })
        .select()
        .single();
      if (error) throw error;
      this.order.set(data as Order);
      this.orderText = data.order_text;
      this.message.add({ severity: 'success', summary: 'Order saved', detail: 'Your order was saved for today.' });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Order failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  async requestPermission(): Promise<void> {
    const member = this.member();
    if (!member || this.saving() || this.request()?.status === 'pending') return;
    this.saving.set(true);
    try {
      const { data, error } = await this.auth.client
        .from('order_requests')
        .upsert({ member_id: member.id, request_date: this.today, status: 'pending' }, { onConflict: 'member_id,request_date' })
        .select('id,status')
        .single();
      if (error) throw error;
      this.request.set((data as OrderRequest) ?? null);
      this.message.add({ severity: 'success', summary: 'Request sent', detail: 'Your request was sent to the admin for approval.' });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Request failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  private async blockedByMinimumBalance(memberId: string): Promise<boolean> {
    const settings = this.settings();
    if (!settings?.min_balance_enabled) return false;
    const month = await this.auth.getOpenMonth();
    if (!month) return false;
    const [{ data: balances }, { data: collections }, { data: entryItems }] = await Promise.all([
      this.auth.client.from('member_month_balances').select('opening_balance').eq('member_id', memberId).eq('month_id', month.id).maybeSingle(),
      this.auth.client.from('collections').select('amount').eq('member_id', memberId).eq('month_id', month.id),
      this.auth.client.from('entry_items').select('amount,daily_entries!inner(month_id)').eq('member_id', memberId).eq('daily_entries.month_id', month.id)
    ]);
    const opening = Number(balances?.opening_balance ?? 0);
    const paid = (collections ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const used = (entryItems ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const remaining = opening + paid - used;
    if (remaining >= settings.min_balance_amount) return false;
    this.message.add({
      severity: 'warn',
      summary: 'Low balance',
      detail: `Your remaining balance is ${remaining.toFixed(2)}. Minimum required is ${settings.min_balance_amount.toFixed(2)}.`
    });
    return true;
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
