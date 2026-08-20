import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import Chart from 'chart.js/auto';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { UI_IMPORTS } from '../../shared/ui';

interface MemberMoney { id: string; userId?: string | null; email: string | null; name: string; given: number; used: number; left: number; }
interface EntryPerson { name: string; amount: number; }
interface EntryPreview { id: string; date: string; remarks?: string; items: EntryPerson[]; total: number; }

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
  collectedTotal = signal(0);
  loggedInName = () => this.auth.user()?.name ?? this.auth.user()?.email?.split('@')[0] ?? '';
  loading = signal(true);
  isAdmin = () => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN';
  personalRow = () => this.rows().find((row) => row.userId === this.auth.user()?.id || row.email === this.auth.user()?.email) ?? null;

  @ViewChild('spendCanvas', { static: true }) spendCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('shareCanvas', { static: true }) shareCanvas?: ElementRef<HTMLCanvasElement>;
  private spendChart?: Chart;
  private shareChart?: Chart;

  totalGiven = () => this.rows().reduce((sum, row) => sum + row.given, 0);
  totalUsed = () => this.rows().reduce((sum, row) => sum + row.used, 0);
  totalLeft = () => this.rows().reduce((sum, row) => sum + row.left, 0);

  constructor(
    private auth: AuthService,
    private api: ApiService,
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
      // Load dashboard stats from API
      const response = await this.api.get<{
        data?: { members: MemberMoney[]; entries: EntryPreview[] };
      }>('/dashboard');
      const stats = response.data ?? (response as unknown as { members: MemberMoney[]; entries: EntryPreview[] });
      const memberRows = stats.members || [];
      this.rows.set(memberRows);
      this.members.set(memberRows.map((member) => ({ id: member.id, name: member.name })));
      this.collectedTotal.set(memberRows.reduce((sum, member) => sum + Number(member.given ?? 0), 0));
      this.previewRows.set(stats.entries || []);
      this.memberUsed.set(
        memberRows
          .filter((member) => Number(member.used) > 0)
          .map((member) => ({ name: member.name, used: Number(member.used) }))
      );
      this.renderCharts();
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to load dashboard', detail: err instanceof Error ? err.message : 'Unknown error' });
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
