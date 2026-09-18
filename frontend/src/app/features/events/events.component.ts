import { Component, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { EventAttendanceStatus, EventItem, EventSummary } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { AuthService } from '../../core/auth.service';
import { CrudPageBase } from '../../shared/crud-page.base';
import { EntityDialogComponent, FieldConfig } from '../../shared/entity-dialog.component';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-events',
  imports: UI_IMPORTS,
  templateUrl: './events.component.html',
  styleUrls: ['../../shared/page.scss', './events.component.scss']
})
export class EventsComponent extends CrudPageBase<EventItem> {
  title = 'Event';
  table = 'events';
  columns = ['name', 'date', 'location', 'approximateBudget'];
  override searchColumns = ['name', 'location'];
  fields: FieldConfig[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'startTime', label: 'Start time', type: 'time' },
    { key: 'endTime', label: 'End time', type: 'time' },
    { key: 'location', label: 'Location' },
    { key: 'approximateBudget', label: 'Approximate budget', type: 'number' }
  ];

  isAdmin = computed(() => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN');

  canAttend = computed(() => this.auth.user()?.role !== 'SUPER_ADMIN');

  attendance = signal<Record<string, EventSummary>>({});

  loadError = signal('');

  constructor(
    repo: RepositoryService,
    dialog: DialogService,
    message: MessageService,
    auth: AuthService,
    private router: Router,
    private workflow: SupabaseWorkflowService
  ) {
    super(repo, dialog, message, auth);
    void this.load();
  }

  override async load(): Promise<void> {
    this.loadError.set('');
    try {
      await super.load();
      await this.refreshAttendance();
    } catch (err) {
      this.loadError.set(this.friendlyError(err));
    }
  }

  async refreshAttendance(): Promise<void> {
    const ids = this.data().map((row) => row.id);
    const map: Record<string, EventSummary> = {};
    for (const id of ids) {
      map[id] = { eventId: id, goingCount: 0, notGoingCount: 0, myStatus: null };
    }
    if (!ids.length) {
      this.attendance.set(map);
      return;
    }
    try {
      const rows = await this.workflow.eventAttendance(ids);
      for (const row of rows) {
        map[row.event_id] = {
          eventId: row.event_id,
          goingCount: Number(row.going_count ?? 0),
          notGoingCount: Number(row.not_going_count ?? 0),
          myStatus: row.my_status ?? null
        };
      }
    } catch {
      // keep zeroed placeholders when the migration isn't applied yet
    }
    this.attendance.set(map);
  }

  async toggleAttendance(row: EventItem, status: EventAttendanceStatus): Promise<void> {
    const current = this.attendance()[row.id]?.myStatus ?? null;
    const next = current === status ? null : status;
    try {
      await this.workflow.setEventAttendance(row.id, next);
      await this.refreshAttendance();
      this.message.add({
        severity: 'success',
        summary: 'Updated',
        detail: next === null ? 'Acceptance removed' : next === 'GOING' ? 'Marked as going' : 'Marked as not going'
      });
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: 'Update failed',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
    }
  }

  private friendlyError(err: unknown): string {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.includes('PGRST205') || reason.includes('relation \"public.events\" does not exist')) {
      return 'The events feature is not enabled in the database yet. Run the 0021_events migration (SQL Editor) to create the tables.';
    }
    return err instanceof Error ? err.message : 'Please try again.';
  }

  override open(row?: EventItem): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: row ? 'Edit Event' : 'Add Event',
      width: '520px',
      data: { title: row ? 'Edit Event' : 'Add Event', fields: this.fields, value: row }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      try {
        const payload = this.sanitize(value);
        row
          ? await this.repo.update<EventItem>(this.table, row.id, payload)
          : await this.repo.create<EventItem>(this.table, payload);
        this.message.add({ severity: 'success', summary: 'Saved', detail: 'Event saved successfully' });
        await this.load();
      } catch (err) {
        this.message.add({
          severity: 'error',
          summary: 'Save failed',
          detail: err instanceof Error ? err.message : 'Please try again.'
        });
      }
    });
  }

  openDetail(row: EventItem): void {
    void this.router.navigate(['/events', row.id]);
  }

  formatDate(value?: string): string {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatBudget(value: number): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }

  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === 'date' || key === 'startTime' || key === 'endTime') {
        payload[key] = val || null;
        continue;
      }
      if (key === 'approximateBudget') {
        payload[key] = val === '' || val == null ? null : Number(val);
        continue;
      }
      payload[key] = val;
    }
    return payload;
  }
}