import { Component, Type, computed, input, output } from '@angular/core';
import { EventPoint } from '../../core/models';
import { UI_IMPORTS } from '../../shared/ui';
import { POINT_ICONS } from '../../shared/event-icons';

@Component({
  selector: 'app-event-timeline',
  imports: UI_IMPORTS,
  templateUrl: './event-timeline.component.html',
  styleUrl: './event-timeline.component.scss'
})
export class EventTimelineComponent {
  readonly points = input<EventPoint[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly eventName = input<string>('');
  readonly select = output<string>();

  protected nodes = computed(() => {
    const list = this.points();
    const count = Math.max(list.length, 1);
    return list.map((_, index) => {
      const angle = (360 / count) * index - 90;
      const rad = (angle * Math.PI) / 180;
      return {
        left: (50 + 42 * Math.cos(rad)).toFixed(3),
        top: (50 + 42 * Math.sin(rad)).toFixed(3)
      };
    });
  });

  protected segments = computed(() => {
    const raw = this.points();
    const n = raw.length;
    if (n < 2) return [];
    const list = raw.map((_, index) => {
      const angle = (360 / n) * index - 90;
      const rad = (angle * Math.PI) / 180;
      return [50 + 42 * Math.cos(rad), 50 + 42 * Math.sin(rad)] as const;
    });
    const inset = 6;
    const segments: string[] = [];
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = list[i];
      const [x1, y1] = list[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const endX = x1 - (dx / len) * inset;
      const endY = y1 - (dy / len) * inset;
      segments.push(`M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`);
    }
    return segments;
  });

  protected selected = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.points().find((point) => point.id === id) ?? null;
  });

  pointIcon(point: EventPoint): Type<unknown> {
    return POINT_ICONS[point.icon] ?? POINT_ICONS['location'];
  }
}