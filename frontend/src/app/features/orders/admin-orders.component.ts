import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { EntityDialogComponent, FieldConfig } from '../../shared/entity-dialog.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';
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
  fields: FieldConfig[] = [{ key: 'orderText', label: 'Order', required: true }];

  constructor(private auth: AuthService, private workflow: SupabaseWorkflowService, private dialog: DialogService, private message: MessageService) {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.workflow.adminOrders(this.date, this.search()));
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
      this.requests.set(await this.workflow.orderRequests(this.date));
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Load failed', detail: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      this.requestLoading.set(false);
    }
  }

  async setRequestStatus(row: any, status: 'approved' | 'rejected'): Promise<void> {
    try {
      await this.workflow.updateOrderRequest(row.id, status);
      this.message.add({
        severity: 'success',
        summary: status === 'approved' ? 'Request approved' : 'Request rejected',
        detail: status === 'approved' ? 'The member can now submit their late order.' : 'The member was notified.'
      });
      await this.load();
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Update failed', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
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
      try {
        await this.workflow.updateOrder(row.id, String(value.orderText ?? '').trim());
        this.message.add({ severity: 'success', summary: 'Order updated', detail: 'Order was updated.' });
        await this.load();
      } catch (err) {
        this.message.add({ severity: 'error', summary: 'Update failed', detail: err instanceof Error ? err.message : 'Unknown error' });
      }
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
      try {
        await this.workflow.deleteOrder(row.id);
        this.message.add({ severity: 'success', summary: 'Order deleted', detail: 'Order was removed.' });
        await this.load();
      } catch (err) {
        this.message.add({ severity: 'error', summary: 'Delete failed', detail: err instanceof Error ? err.message : 'Unknown error' });
      }
    });
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
