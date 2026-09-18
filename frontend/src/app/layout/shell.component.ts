import { Component, OnInit, Type, computed, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  LucideCalendarDays,
  LucideCalendarRange,
  LucideChartColumn,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideBell,
  LucideLayoutDashboard,
  LucideNotebookPen,
  LucideClipboardList,
  LucideSettings,
  LucideStore,
  LucideUsers,
  LucideUtensilsCrossed,
  LucideWallet
} from '@lucide/angular';
import { UI_IMPORTS } from '../shared/ui';
import { AuthService } from '../core/auth.service';
import { SupabaseWorkflowService } from '../core/supabase-workflow.service';
import { ThemeService } from '../core/theme.service';
import { AppNotification, NotificationService } from '../core/notification.service';

interface NavItem {
  path: string;
  label: string;
  icon: Type<unknown>;
}

@Component({
  selector: 'app-shell',
  imports: [...UI_IMPORTS, RouterOutlet, RouterLink],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit {
  collapsed = signal(false);
  mobileOpen = signal(false);
  notificationsOpen = signal(false);
  search = signal('');
  isDesktop = signal(true);
  private media = matchMedia('(min-width: 900px)');

  nav = computed<NavItem[]>(() => {
    if (this.isSuperAdmin()) {
      return [
        { path: '/teams', label: 'Registered Teams', icon: LucideStore }
      ];
    }
    return [
      { path: '/dashboard', label: 'Dashboard', icon: LucideLayoutDashboard },
      { path: '/events', label: 'Events', icon: LucideCalendarDays },
      ...(this.isAdmin() ? [] : [{ path: '/order', label: 'Order', icon: LucideNotebookPen }]),
      ...(this.isAdmin() ? [{ path: '/orders', label: 'Manage Orders', icon: LucideClipboardList }] : []),
      { path: '/menu', label: 'Menu', icon: LucideUtensilsCrossed },
...(this.isSuperAdmin() ? [] : [
        { path: '/members', label: 'Members', icon: LucideUsers }
      ]),
      ...(this.isAdmin() ? [
        { path: '/daily-entry', label: 'Daily Entry', icon: LucideNotebookPen }
      ] : []),
      ...(this.isAdmin() ? [
        { path: '/collections', label: 'Collections', icon: LucideWallet },
        { path: '/months', label: 'Months', icon: LucideCalendarRange }
      ] : []),
      { path: '/monthly-report', label: 'Monthly Report', icon: LucideChartColumn },
      ...(this.isAdmin() ? [{ path: '/settings', label: 'Settings', icon: LucideSettings }] : [])
    ];
  });

  isSuperAdmin = computed(() => this.auth.user()?.role === 'SUPER_ADMIN');

  isAdmin = computed(() => this.auth.user()?.role === 'TEAM_ADMIN');

  teamName = signal('');
  brandName = 'Snack Record';
  private readonly teamLoaded = new Set<string>();
  private readonly teamWatcher = effect(() => {
    const teamId = this.auth.user()?.teamId;
    if (teamId && !this.teamLoaded.has(teamId)) {
      this.teamLoaded.add(teamId);
      void this.loadTeam();
    }
  });

  notifications = computed<AppNotification[]>(() => this.notificationService.items());
  unreadCount = computed(() => this.notificationService.unreadCount());
  private readonly notificationWatcher = effect(() => {
    const userId = this.auth.user()?.id;
    if (userId) void this.notificationService.watch(userId);
    else this.notificationService.stop();
  });

  private async loadTeam(): Promise<void> {
    if (!this.auth.user()?.teamId) return;
    try {
      const team = await this.workflow.team();
      const name = team?.name?.trim();
      if (name) this.teamName.set(name);
    } catch {
      // Team name is cosmetic; ignore failures silently
    }
  }

  userName = computed(() => this.auth.user()?.name ?? 'Account');
  role = computed(() => {
    const userRole = this.auth.user()?.role;
    if (userRole === 'SUPER_ADMIN') return 'Super Admin';
    if (userRole === 'TEAM_ADMIN') return 'Administrator';
    return 'Member';
  });

  initials = computed(() =>
    this.userName()
      .split(' ')
      .filter(Boolean)
      .at(0)
      ?.slice(0, 2)
      .toUpperCase() || 'AC'
  );

  constructor(public auth: AuthService, public router: Router, public theme: ThemeService, private workflow: SupabaseWorkflowService, private notificationService: NotificationService) {
    this.isDesktop.set(this.media.matches);
  }

  ngOnInit(): void {
    this.media.addEventListener('change', (event) => {
      this.isDesktop.set(event.matches);
      if (event.matches) this.mobileOpen.set(false);
    });
  }

  toggleSidebar(): void {
    if (this.isDesktop()) {
      this.collapsed.update((value) => !value);
    } else {
      this.mobileOpen.set(!this.mobileOpen());
    }
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
    this.notificationsOpen.set(false);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((open) => !open);
    if (this.notificationsOpen()) void this.notificationService.load();
  }

  markAllNotificationsRead(): void {
    void this.notificationService.markAllRead();
  }

  markNotificationRead(item: AppNotification): void {
    if (!item.readAt) void this.notificationService.markRead(item.id);
  }

  deleteNotification(event: Event, item: AppNotification): void {
    event.stopPropagation();
    void this.notificationService.delete(item.id);
  }

  clearAllNotifications(): void {
    void this.notificationService.clearAll();
  }

  notificationIcon(type: AppNotification['type']): Type<unknown> {
    if (type === 'order_permission_approved') return LucideCircleCheck;
    if (type === 'order_permission_rejected') return LucideCircleAlert;
    if (type === 'order_submitted') return LucideClipboardList;
    if (type === 'team_registered') return LucideStore;
    return LucideBell;
  }

  timeAgo(iso: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days}d ago`;
  }

  runQuickSearch(): void {
    const term = this.search().trim().toLowerCase();
    if (!term) return;
    const item = this.nav().find((navItem) => navItem.label.toLowerCase().includes(term));
    if (item) void this.router.navigateByUrl(item.path);
    this.search.set('');
  }

  isActive(path: string, currentUrl = this.router.url.split('?')[0]): boolean {
    return currentUrl === path || currentUrl.startsWith(`${path}/`);
  }

  goToMonths(): void {
    void this.router.navigateByUrl('/months');
  }
}
