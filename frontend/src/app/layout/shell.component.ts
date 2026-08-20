import { Component, OnInit, Type, computed, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MessageService } from 'primeng/api';
import {
  LucideCalendarRange,
  LucideChartColumn,
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
import { ApiService } from '../core/api.service';

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
  profileOpen = signal(false);
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
      ...(this.isAdmin() ? [] : [{ path: '/order', label: 'Order', icon: LucideNotebookPen }]),
      ...(this.isAdmin() ? [{ path: '/orders', label: 'Manage Orders', icon: LucideClipboardList }] : []),
      { path: '/menu', label: 'Menu', icon: LucideUtensilsCrossed },
...(this.isSuperAdmin() ? [] : [
        { path: '/members', label: 'Members', icon: LucideUsers },
        { path: '/daily-entry', label: 'Daily Entry', icon: LucideNotebookPen }
      ]),
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

  private async loadTeam(): Promise<void> {
    if (!this.auth.user()?.teamId) return;
    try {
      const response = await this.api.get<{ team?: { name: string } }>('/team');
      const name = response.team?.name?.trim();
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

  constructor(public auth: AuthService, public router: Router, private message: MessageService, private api: ApiService) {
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
    this.profileOpen.set(false);
  }

  runQuickSearch(): void {
    const term = this.search().trim().toLowerCase();
    if (!term) return;
    const item = this.nav().find((navItem) => navItem.label.toLowerCase().includes(term));
    if (item) void this.router.navigateByUrl(item.path);
    this.search.set('');
  }

  showNotifications(): void {
    this.message.add({ severity: 'info', summary: 'Notifications', detail: 'No new notifications.' });
  }

  isActive(path: string, currentUrl = this.router.url.split('?')[0]): boolean {
    return currentUrl === path || currentUrl.startsWith(`${path}/`);
  }

  goToMonths(): void {
    void this.router.navigateByUrl('/months');
  }
}
