import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { EntityDialogComponent, FieldConfig } from '../../shared/entity-dialog.component';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-admin-orders',
  imports: UI_IMPORTS,
  templateUrl: './admin-orders.component.html',
  styleUrls: ['../../shared/page.scss', './orders.component.scss']
})
export class AdminOrdersComponent {
  rows = signal<any[]>([]);
  requests = signal<any[]>([]);
  loading = signal(false);
  requestLoading = signal(false);
  search = signal('');
  date = this.toIsoDate(new Date());
  dateValue = new Date();
  fields: FieldConfig[] = [{ key: 'order_text', label: 'Order', required: true }];

  constructor(private auth: SupabaseService, private dialog: DialogService, private message: MessageService) {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      let query = this.auth.client
        .from('orders')
        .select('*, members(name,email)')
        .eq('order_date', this.date)
        .order('updated_at', { ascending: false });
      const term = this.search().trim();
      if (term) query = query.or(`order_text.ilike.%${term}%,members.name.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      this.rows.set(data ?? []);
      await this.loadRequests();
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Load failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRequests(): Promise<void> {
    this.requestLoading.set(true);
    try {
      const { data, error } = await this.auth.client
        .from('order_requests')
        .select('id,member_id,status,created_at,members(name,email)')
        .eq('request_date', this.date)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.requests.set(data ?? []);
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Load failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.requestLoading.set(false);
    }
  }

  async setRequestStatus(row: any, status: 'approved' | 'rejected'): Promise<void> {
    const { error } = await this.auth.client.from('order_requests').update({ status }).eq('id', row.id);
    if (error) {
      this.message.add({ severity: 'error', summary: 'Update failed', detail: error.message });
      return;
    }
    this.message.add({
      severity: 'success',
      summary: status === 'approved' ? 'Request approved' : 'Request rejected',
      detail: status === 'approved' ? 'The member can now submit their late order.' : 'The member was notified.'
    });
    await this.load();
  }

  setDate(value: Date | string | null): void {
    if (!value) return;
    const date = value instanceof Date ? value : new Date(value);
    this.dateValue = date;
    this.date = this.toIsoDate(date);
    void this.load();
  }

  edit(row: any): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: 'Edit Order',
      width: '520px',
      data: { title: 'Edit Order', fields: this.fields, value: row }
    });
    ref?.onClose.subscribe(async (value) => {
      if (!value) return;
      const { error } = await this.auth.client.from('orders').update({ order_text: value.order_text }).eq('id', row.id);
      if (error) {
        this.message.add({ severity: 'error', summary: 'Update failed', detail: error.message });
        return;
      }
      this.message.add({ severity: 'success', summary: 'Order updated', detail: 'Order was updated.' });
      await this.load();
    });
  }

  remove(row: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Order',
      width: '460px',
      data: { title: 'Delete Order', message: 'This order will be removed.', action: 'Delete' }
    });
    ref?.onClose.subscribe(async (ok) => {
      if (!ok) return;
      const { error } = await this.auth.client.from('orders').delete().eq('id', row.id);
      if (error) {
        this.message.add({ severity: 'error', summary: 'Delete failed', detail: error.message });
        return;
      }
      this.message.add({ severity: 'success', summary: 'Order deleted', detail: 'Order was removed.' });
      await this.load();
    });
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
