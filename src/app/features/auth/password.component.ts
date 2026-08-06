import { Component, computed, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UI_IMPORTS } from '../../shared/ui';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-password',
  imports: [...UI_IMPORTS, RouterLink],
  templateUrl: './password.component.html',
  styleUrl: './password.component.scss'
})
export class PasswordComponent {
  loading = signal(false);
  mode = signal<'forgot' | 'reset' | 'change'>('forgot');
  title = computed(() => this.mode() === 'forgot' ? 'Forgot Password' : this.mode() === 'reset' ? 'Reset Password' : 'Change Password');
  form;
  constructor(private fb: FormBuilder, private route: ActivatedRoute, private auth: SupabaseService, private snack: MatSnackBar) {
    this.mode.set(this.route.snapshot.data['mode'] as 'forgot' | 'reset' | 'change');
    this.form = this.fb.group({ email: ['', [Validators.email]], password: ['', [Validators.minLength(6)]] });
  }
  async submit(): Promise<void> {
    this.loading.set(true);
    try {
      if (this.mode() === 'forgot') await this.auth.forgotPassword(this.form.value.email ?? '');
      else await this.auth.updatePassword(this.form.value.password ?? '');
      this.snack.open('Request completed', 'Dismiss', { duration: 3500 });
    } finally { this.loading.set(false); }
  }
}
