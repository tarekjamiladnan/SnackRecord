import { Component, OnDestroy, computed, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Member, Order } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';
import { UI_IMPORTS } from '../../shared/ui';

interface OrderRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface Settings {
  minBalanceEnabled: boolean;
  minBalanceAmount: number;
  orderClosingTime?: string;
}

interface MemberInfoResponse {
  data?: {
    member: Member | null;
    settings: Settings | null;
    order: Order | null;
    request: OrderRequest | null;
  };
}

@Component({
  selector: 'app-order',
  imports: UI_IMPORTS,
  templateUrl: './order.component.html',
  styleUrls: ['../../shared/page.scss', './orders.component.scss']
})
export class OrderComponent implements OnDestroy {
  orderText = '';
  order = signal<Order | null>(null);
  member = signal<Member | null>(null);
  settings = signal<Settings | null>(null);
  request = signal<OrderRequest | null>(null);
  loading = signal(true);
  saving = signal(false);
  today = this.toIsoDate(new Date());
  now = signal(new Date());
  private timer = setInterval(() => this.now.set(new Date()), 30000);

  closingTime = computed(() => this.settings()?.orderClosingTime || '16:20');
  cutoffDisplay = computed(() => this.formatClock(this.closingTime()));
  afterCutoff = computed(() => {
    const date = this.now();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}` >= this.closingTime();
  });
  isAdmin = () => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN';
  isClosed = () => this.afterCutoff() && this.request()?.status !== 'approved';
  remainingChars = () => 500 - this.orderText.length;

  constructor(private auth: AuthService, private workflow: SupabaseWorkflowService, private message: MessageService) {
    void this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const info = await this.workflow.memberInfo(this.today) as NonNullable<MemberInfoResponse['data']>;
      this.member.set(info.member ?? null);
      this.settings.set(info.settings ?? null);
      this.request.set(info.request ?? null);
      const order = info.order;
      this.order.set(order ?? null);
      this.orderText = order?.orderText ?? '';
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: 'Failed to load order',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
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
        detail: `Ordering closed at ${this.cutoffDisplay()}. Request permission from the admin to place an order.`
      });
      return;
    }
    this.saving.set(true);
    try {
      if (await this.blockedByMinimumBalance(member.id)) return;
      const response = await this.workflow.submitOrder<Order>(this.today, text);
      this.order.set(response);
      this.orderText = response?.orderText ?? text;
      this.message.add({ severity: 'success', summary: 'Order saved', detail: 'Your order was saved for today.' });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Order failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  async requestPermission(): Promise<void> {
    if (this.saving() || this.request()?.status === 'pending') return;
    this.saving.set(true);
    try {
      const response = await this.workflow.requestLateOrder<OrderRequest>(this.today);
      this.request.set(response);
      this.message.add({ severity: 'success', summary: 'Request sent', detail: 'Your request was sent to the admin for approval.' });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Request failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  private async blockedByMinimumBalance(memberId: string): Promise<boolean> {
    const settings = this.settings();
    if (!settings?.minBalanceEnabled) return false;
    try {
      const balance = await this.workflow.memberBalance(memberId);
      if (balance < Number(settings.minBalanceAmount ?? 0)) {
        this.message.add({
          severity: 'warn',
          summary: 'Low balance',
          detail: `Your balance is low (${balance.toFixed(2)}). Please make a payment.`
        });
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Balance check failed:', err);
      return false;
    }
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }

  private formatClock(time: string): string {
    const match = /^(\d{2}):(\d{2})$/.exec(String(time).trim());
    if (!match) return time || '4:20 PM';
    let hours = Number(match[1]);
    const minutes = match[2];
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${suffix}`;
  }
}
