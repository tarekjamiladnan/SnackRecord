import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';
import { HomeComponent } from './features/home/home.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeComponent },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: 'dashboard', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'], '/teams')], loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'events', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'])], loadComponent: () => import('./features/events/events.component').then((m) => m.EventsComponent) },
      { path: 'events/:id', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'])], loadComponent: () => import('./features/events/event-detail.component').then((m) => m.EventDetailComponent) },
      { path: 'members', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'])], loadComponent: () => import('./features/members/members.component').then((m) => m.MembersComponent) },
      { path: 'menu', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'])], loadComponent: () => import('./features/menu/menu.component').then((m) => m.MenuComponent) },
      { path: 'order', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'], '/orders')], loadComponent: () => import('./features/orders/order.component').then((m) => m.OrderComponent) },
      { path: 'orders', canActivate: [roleGuard(['TEAM_ADMIN'])], loadComponent: () => import('./features/orders/admin-orders.component').then((m) => m.AdminOrdersComponent) },
      { path: 'daily-entry', canActivate: [roleGuard(['TEAM_ADMIN', 'SUPER_ADMIN'], '/dashboard')], loadComponent: () => import('./features/daily-entry/daily-entry.component').then((m) => m.DailyEntryComponent) },
      { path: 'collections', canActivate: [roleGuard(['TEAM_ADMIN'])], loadComponent: () => import('./features/collections/collections.component').then((m) => m.CollectionsComponent) },
      { path: 'monthly-report', canActivate: [roleGuard(['MEMBER', 'TEAM_ADMIN'])], loadComponent: () => import('./features/monthly-report/monthly-report.component').then((m) => m.MonthlyReportComponent) },
      { path: 'months', canActivate: [roleGuard(['TEAM_ADMIN'])], loadComponent: () => import('./features/months/months.component').then((m) => m.MonthsComponent) },
      {
        path: 'settings',
        canActivate: [roleGuard(['TEAM_ADMIN'])],
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent)
      },
      {
        path: 'teams',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/teams/teams.component').then((m) => m.TeamsComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
