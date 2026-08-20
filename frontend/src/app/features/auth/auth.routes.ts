import { Routes } from '@angular/router';
import { LoginComponent } from './login.component';
import { PasswordComponent } from './password.component';

export const AUTH_ROUTES: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: PasswordComponent, data: { mode: 'forgot' } },
  { path: 'reset-password', component: PasswordComponent, data: { mode: 'reset' } },
  { path: 'change-password', component: PasswordComponent, data: { mode: 'change' } }
];
