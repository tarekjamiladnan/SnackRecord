import { Component, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UI_IMPORTS } from '../shared/ui';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-shell',
  imports: [...UI_IMPORTS, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  wide = signal(matchMedia('(min-width: 900px)').matches);
  profileOpen = signal(false);
  nav = computed(() => [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/members', label: 'Members' },
    { path: '/menu', label: 'Menu' },
    { path: '/daily-entry', label: 'Daily Entry' },
    { path: '/collections', label: 'Collections' },
    { path: '/monthly-report', label: 'Monthly Report' },
    { path: '/months', label: 'Months' },
    ...(this.auth.profile()?.role === 'admin' ? [{ path: '/settings', label: 'Settings' }] : [])
  ]);
  pageTitle = computed(() => this.auth.profile()?.full_name ?? this.auth.profile()?.email ?? 'Snack Record');
  constructor(public auth: SupabaseService) {}
}
