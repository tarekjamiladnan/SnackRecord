import { Component, computed, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { UI_IMPORTS } from '../../shared/ui';
import { SupabaseService } from '../../core/supabase.service';

function passwordMatchValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const password = control.get('password')?.value;
    const confirm = control.get('confirm')?.value;
    if (!confirm) return null;
    return password === confirm ? null : { mismatch: true };
  };
}

interface StrengthMeta {
  label: string;
  level: string;
  bars: number;
}

const STRENGTH_META: StrengthMeta[] = [
  { label: 'Weak', level: 'weak', bars: 1 },
  { label: 'Weak', level: 'weak', bars: 1 },
  { label: 'Fair', level: 'fair', bars: 2 },
  { label: 'Good', level: 'good', bars: 3 },
  { label: 'Strong', level: 'strong', bars: 4 }
];

@Component({
  selector: 'app-password',
  imports: [...UI_IMPORTS, RouterLink],
  templateUrl: './password.component.html',
  styleUrls: ['../../shared/auth.scss', './password.component.scss']
})
export class PasswordComponent {
  loading = signal(false);
  showPassword = signal(false);
  error = signal('');
  mode = signal<'forgot' | 'reset' | 'change'>('forgot');
  title = computed(() => (this.mode() === 'forgot' ? 'Forgot Password' : this.mode() === 'reset' ? 'Reset Password' : 'Change Password'));
  isForgot = computed(() => this.mode() === 'forgot');
  form;

  strength = computed<StrengthMeta>(() => {
    const pw: string = this.form.get('password')?.value ?? '';
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/(?=.*[A-Za-z])(?=.*\d)/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return STRENGTH_META[Math.min(score, 4)];
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private auth: SupabaseService,
    private message: MessageService
  ) {
    this.mode.set(this.route.snapshot.data['mode'] as 'forgot' | 'reset' | 'change');
    const isForgot = this.mode() === 'forgot';
    this.form = this.fb.group(
      {
        email: ['', isForgot ? [Validators.required, Validators.email] : []],
        password: ['', isForgot ? [] : [Validators.required, Validators.minLength(6)]],
        confirm: ['', isForgot ? [] : [Validators.required]]
      },
      isForgot ? {} : { validators: passwordMatchValidator() }
    );
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.isForgot()) {
        await this.auth.forgotPassword(this.form.value.email ?? '');
        this.message.add({ severity: 'success', summary: 'Reset link sent', detail: 'If the email exists, check your inbox for the next steps.' });
      } else {
        await this.auth.updatePassword(this.form.value.password ?? '');
        this.message.add({ severity: 'success', summary: 'Password updated', detail: 'Your password has been changed successfully.' });
        this.form.reset();
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
