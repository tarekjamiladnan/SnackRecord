import { Component, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UI_IMPORTS } from '../../shared/ui';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [...UI_IMPORTS, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['../../shared/auth.scss', './login.component.scss']
})
export class LoginComponent {
  loading = signal(false);
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  error = signal('');
  info = signal('');
  mode = signal<'login' | 'register'>('login');
  form;
  registerForm;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private route: ActivatedRoute) {
    this.form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
    this.registerForm = this.fb.nonNullable.group({
      teamName: ['', [Validators.required, Validators.minLength(2)]],
      adminName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordsMatch });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('register')) this.setMode('register');
    });
  }

  passwordsMatch(group: { value: { password?: string; confirmPassword?: string } }): Record<string, boolean> | null {
    const { password, confirmPassword } = group.value;
    return password && confirmPassword && password !== confirmPassword ? { mismatch: true } : null;
  }

  setMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.error.set('');
    this.info.set('');
  }

  async login(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.form.controls.email.value, this.form.controls.password.value);
      const target = this.auth.user()?.role === 'SUPER_ADMIN' ? '/teams' : '/dashboard';
      await this.router.navigateByUrl(target);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Login failed');
    } finally { this.loading.set(false); }
  }

  async register(): Promise<void> {
    if (this.registerForm.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.info.set('');
    try {
      const c = this.registerForm.controls;
      await this.auth.register(c.teamName.value, c.adminName.value, c.email.value, c.phone.value, c.password.value, c.confirmPassword.value);
      await this.auth.login(c.email.value, c.password.value);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Registration failed');
    } finally { this.loading.set(false); }
  }
}
