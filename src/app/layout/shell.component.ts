import { Component, OnInit, Type, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MessageService } from 'primeng/api';
import {
  LucideCalendarRange,
  LucideChartColumn,
  LucideLayoutDashboard,
  LucideNotebookPen,
  LucideClipboardList,
  LucideSettings,
  LucideUsers,
  LucideUtensilsCrossed,
  LucideWallet
} from '@lucide/angular';
import { UI_IMPORTS } from '../shared/ui';
import { SupabaseService } from '../core/supabase.service';

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

  nav = computed<NavItem[]>(() => [
    { path: '/dashboard', label: 'Dashboard', icon: LucideLayoutDashboard },
    ...(this.isAdmin() ? [] : [{ path: '/order', label: 'Order', icon: LucideNotebookPen }]),
    ...(this.isAdmin() ? [{ path: '/orders', label: 'Manage Orders', icon: LucideClipboardList }] : []),
    { path: '/menu', label: 'Menu', icon: LucideUtensilsCrossed },
    ...(this.isAdmin() ? [
      { path: '/members', label: 'Members', icon: LucideUsers },
      { path: '/daily-entry', label: 'Daily Entry', icon: LucideNotebookPen },
      { path: '/collections', label: 'Collections', icon: LucideWallet },
      { path: '/months', label: 'Months', icon: LucideCalendarRange }
    ] : []),
    { path: '/monthly-report', label: 'Monthly Report', icon: LucideChartColumn },
    ...(this.isAdmin() ? [{ path: '/settings', label: 'Settings', icon: LucideSettings }] : [])
  ]);

  isAdmin = computed(() => {
    const email = this.auth.user()?.email?.toLowerCase() ?? this.auth.profile()?.email?.toLowerCase();
    return this.auth.profile()?.role === 'admin' || email === 'adnan@gmail.com' || email === 'admin@gmail.com';
  });
  userName = computed(() => this.auth.profile()?.full_name ?? this.auth.profile()?.email ?? 'Account');
  role = computed(() => (this.isAdmin() ? 'Administrator' : 'User'));

  currentTitle = computed(() => {
    const url = this.router.url.split('?')[0];
    const item = this.nav().find((navItem) => this.isActive(navItem.path, url));
    return item?.label ?? 'Dashboard';
  });

  initials = computed(() =>
    this.userName()
      .split(' ')
      .filter(Boolean)
      .at(0)
      ?.slice(0, 2)
      .toUpperCase() || 'AC'
  );

  constructor(public auth: SupabaseService, public router: Router, private message: MessageService) {
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
