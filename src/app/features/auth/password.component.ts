import { Component, computed, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { UI_IMPORTS } from '../../shared/ui';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-password',
  imports: [...UI_IMPORTS, RouterLink],
  templateUrl: './password.component.html',
  styleUrls: ['../../shared/auth.scss', './password.component.scss']
})
export class PasswordComponent {
  loading = signal(false);
  mode = signal<'forgot' | 'reset' | 'change'>('forgot');
  title = computed(() => this.mode() === 'forgot' ? 'Forgot Password' : this.mode() === 'reset' ? 'Reset Password' : 'Change Password');
  form;
  constructor(private fb: FormBuilder, private route: ActivatedRoute, private auth: SupabaseService, private message: MessageService) {
    this.mode.set(this.route.snapshot.data['mode'] as 'forgot' | 'reset' | 'change');
    this.form = this.fb.group({ email: ['', [Validators.email]], password: ['', [Validators.minLength(6)]] });
  }
  async submit(): Promise<void> {
    this.loading.set(true);
    try {
      if (this.mode() === 'forgot') await this.auth.forgotPassword(this.form.value.email ?? '');
      else await this.auth.updatePassword(this.form.value.password ?? '');
      this.message.add({ severity: 'success', summary: 'Request completed', detail: 'Check your inbox for the next steps.' });
    } finally { this.loading.set(false); }
  }
}
