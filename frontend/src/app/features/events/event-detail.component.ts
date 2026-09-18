import { Component, Type, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { EventItem, EventPoint } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';
import { AuthService } from '../../core/auth.service';
import { FieldConfig } from '../../shared/entity-dialog.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { EntityDialogComponent } from '../../shared/entity-dialog.component';
import { POINT_ICONS, POINT_ICON_OPTIONS } from '../../shared/event-icons';
import { UI_IMPORTS } from '../../shared/ui';
import { EventTimelineComponent } from './event-timeline.component';

@Component({
  selector: 'app-event-detail',
  imports: [...UI_IMPORTS, EventTimelineComponent],
  templateUrl: './event-detail.component.html',
  styleUrls: ['../../shared/page.scss', './event-detail.component.scss']
})
export class EventDetailComponent {
  private readonly id: string;

  event = signal<EventItem | null>(null);
  loading = signal(true);
  loadError = signal('');
  selectedPointId = signal<string | null>(null);
  points = signal<EventPoint[]>([]);

  isAdmin = computed(() => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN');

  readonly eventFields: FieldConfig[] = [
    { key: 'name', label: 'Event Name', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'startTime', label: 'Start time', type: 'time' },
    { key: 'endTime', label: 'End time', type: 'time' },
    { key: 'location', label: 'Location' },
    { key: 'approximateBudget', label: 'Approximate budget', type: 'number' }
  ];

  readonly pointFields: FieldConfig[] = [
    { key: 'title', label: 'Title', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'time', label: 'Time', type: 'time' },
    { key: 'location', label: 'Location' },
    { key: 'icon', label: 'Icon', type: 'icon', options: POINT_ICON_OPTIONS, icons: POINT_ICONS }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private repo: RepositoryService,
    private workflow: SupabaseWorkflowService,
    private dialog: DialogService,
    private message: MessageService,
    private auth: AuthService
  ) {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const detail = await this.workflow.eventDetail(this.id);
      this.event.set(detail);
      this.points.set(Array.isArray(detail.points) ? [...detail.points] : []);
      this.selectPoint(null);
    } catch (err) {
      this.loadError.set(this.friendlyError(err));
      this.event.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  selectPoint(id: string | null): void {
    this.selectedPointId.set(id);
  }

  pointIcon(point: EventPoint): Type<unknown> {
    return POINT_ICONS[point.icon] ?? POINT_ICONS['location'];
  }

  onPointDrop(event: CdkDragDrop<EventPoint[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = [...this.points()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.points.set(list);
    list.forEach((point, index) => (point.position = index));
    void this.persistPointOrder();
  }

  private async persistPointOrder(): Promise<void> {
    const current = this.event();
    if (!current) return;
    try {
      await this.workflow.reorderPoints(current.id, this.points().map((point) => point.id));
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: 'Reorder failed',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
      await this.load();
    }
  }

  openEvent(row?: EventItem): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: row ? 'Edit Event' : 'Add Event',
      width: '520px',
      data: { title: row ? 'Edit Event' : 'Add Event', fields: this.eventFields, value: row }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      try {
        const payload = this.sanitize(value);
        if (row) await this.repo.update<EventItem>('events', row.id, payload);
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

  deleteEvent(): void {
    const current = this.event();
    if (!current) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Event',
      width: '460px',
      data: {
        title: 'Delete Event',
        message: `Delete "${current.name}" and all of its points? This cannot be undone.`,
        action: 'Delete',
        requireText: 'DELETE'
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (ok) => {
      if (!ok) return;
      await this.repo.remove('events', current.id);
      this.message.add({ severity: 'success', summary: 'Deleted', detail: 'Event deleted' });
      void this.router.navigate(['/events']);
    });
  }

  openPoint(event: Event | null, point?: EventPoint): void {
    event?.stopPropagation();
    const ref = this.dialog.open(EntityDialogComponent, {
      header: point ? 'Edit Point' : 'Add Point',
      width: '460px',
      data: { title: point ? 'Edit Point' : 'Add Point', fields: this.pointFields, value: point }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      try {
        const payload = { ...value, time: value.time || null, icon: value.icon || 'location' };
        if (point) {
          await this.repo.update<EventPoint>('event_points', point.id, payload);
        } else {
          await this.repo.create<EventPoint>('event_points', {
            ...payload,
            eventId: this.event()?.id,
            position: this.points().length
          });
        }
        this.message.add({ severity: 'success', summary: 'Saved', detail: 'Point saved successfully' });
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

  deletePoint(event: Event, point: EventPoint): void {
    event.stopPropagation();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Point',
      width: '460px',
      data: {
        title: 'Delete Point',
        message: `Delete "${point.title}"? This cannot be undone.`,
        action: 'Delete'
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (ok) => {
      if (!ok) return;
      await this.repo.remove('event_points', point.id);
      this.message.add({ severity: 'success', summary: 'Deleted', detail: 'Point deleted' });
      await this.load();
    });
  }

  formatDate(value?: string): string {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatBudget(value?: number | null): string {
    if (value == null) return '';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }

  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === 'date' || key === 'startTime' || key === 'endTime') {
        payload[key] = val || null;
      } else if (key === 'approximateBudget') {
        payload[key] = val === '' || val == null ? null : Number(val);
      } else {
        payload[key] = val;
      }
    }
    return payload;
  }

  private friendlyError(err: unknown): string {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.includes('PGRST205') || reason.includes('does not exist')) {
      return 'The events feature is not enabled in the database yet. Run the events migration (SQL Editor) to create the tables.';
    }
    return err instanceof Error ? err.message : 'Please try again.';
  }
}