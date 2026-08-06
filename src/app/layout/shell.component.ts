import { Component, OnInit, Type, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  LucideCalendarRange,
  LucideChartColumn,
  LucideLayoutDashboard,
  LucideNotebookPen,
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
    { path: '/members', label: 'Members', icon: LucideUsers },
    { path: '/menu', label: 'Menu', icon: LucideUtensilsCrossed },
    { path: '/daily-entry', label: 'Daily Entry', icon: LucideNotebookPen },
    { path: '/collections', label: 'Collections', icon: LucideWallet },
    { path: '/monthly-report', label: 'Monthly Report', icon: LucideChartColumn },
    { path: '/months', label: 'Months', icon: LucideCalendarRange },
    ...(this.auth.profile()?.role === 'admin' ? [{ path: '/settings', label: 'Settings', icon: LucideSettings }] : [])
  ]);

  userName = computed(() => this.auth.profile()?.full_name ?? this.auth.profile()?.email ?? 'Account');
  role = computed(() => (this.auth.profile()?.role === 'admin' ? 'Administrator' : 'Manager'));

  currentTitle = computed(() => {
    const url = this.router.url.split('?')[0];
    const item = this.nav().find((navItem) => url.startsWith(navItem.path));
    return item?.label ?? 'Dashboard';
  });

  initials = computed(() =>
    this.userName()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A'
  );

  constructor(public auth: SupabaseService, public router: Router) {
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

  goToMonths(): void {
    void this.router.navigateByUrl('/months');
  }
}
