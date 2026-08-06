import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'members', loadComponent: () => import('./features/members/members.component').then((m) => m.MembersComponent) },
      { path: 'menu', loadComponent: () => import('./features/menu/menu.component').then((m) => m.MenuComponent) },
      { path: 'daily-entry', loadComponent: () => import('./features/daily-entry/daily-entry.component').then((m) => m.DailyEntryComponent) },
      { path: 'collections', loadComponent: () => import('./features/collections/collections.component').then((m) => m.CollectionsComponent) },
      { path: 'monthly-report', loadComponent: () => import('./features/monthly-report/monthly-report.component').then((m) => m.MonthlyReportComponent) },
      { path: 'months', loadComponent: () => import('./features/months/months.component').then((m) => m.MonthsComponent) },
      {
        path: 'settings',
        canActivate: [roleGuard(['admin'])],
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
