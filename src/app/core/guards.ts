import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Role } from './models';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(SupabaseService);
  const router = inject(Router);
  await auth.restoreSession();
  return auth.session() ? true : router.createUrlTree(['/auth/login']);
};

export const roleGuard = (roles: Role[], redirectTo = '/dashboard'): CanActivateFn => async () => {
  const auth = inject(SupabaseService);
  const router = inject(Router);
  await auth.restoreSession();
  return auth.hasRole(roles) ? true : router.createUrlTree([redirectTo]);
};
