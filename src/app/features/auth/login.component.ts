import { Component, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UI_IMPORTS } from '../../shared/ui';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-login',
  imports: [...UI_IMPORTS, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  loading = signal(false);
  showPassword = signal(false);
  error = signal('');
  form;
  constructor(private fb: FormBuilder, private auth: SupabaseService, private router: Router) {
    this.form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  }
  async login(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.signIn(this.form.controls.email.value, this.form.controls.password.value);
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Login failed');
    } finally { this.loading.set(false); }
  }
}
