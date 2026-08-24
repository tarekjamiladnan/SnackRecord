import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';
import { RepositoryService } from '../../core/repository.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-settings',
  imports: UI_IMPORTS,
  templateUrl: './settings.component.html',
  styleUrls: ['../../shared/page.scss', './settings.component.scss']
})
export class SettingsComponent {
  form;
  timezones: string[] = SettingsComponent.loadTimezones();
  private static readonly DEFAULT_TIMEZONE = 'Asia/Dhaka';

  private static loadTimezones(): string[] {
    try {
      const supported = (Intl as unknown as { supportedValuesOf?: (kind: 'timeZone') => string[] }).supportedValuesOf;
      if (typeof supported === 'function') return supported('timeZone');
    } catch {
      // older engines
    }
    return ['UTC', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  }

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private repo: RepositoryService,
    private message: MessageService,
    private router: Router
  ) {
    this.form = this.fb.group({
      managerName: ['', Validators.required],
      minBalanceEnabled: [false],
      minBalanceAmount: [20, [Validators.min(0)]],
      orderClosingTime: ['16:20', [Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
      timezone: [SettingsComponent.DEFAULT_TIMEZONE]
    });
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const response = await this.repo.getById<any>('settings', 1);
      const settings = response?.data ?? response;
      if (settings) {
        this.form.patchValue({
          managerName: settings.managerName ?? '',
          minBalanceEnabled: !!settings.minBalanceEnabled,
          minBalanceAmount: Number(settings.minBalanceAmount ?? 20),
          orderClosingTime: settings.orderClosingTime || '16:20',
          timezone: this.timezones.includes(settings.timezone) ? settings.timezone : SettingsComponent.DEFAULT_TIMEZONE
        });
      }
    } catch {
      // Settings may not exist yet
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const rawAmount = this.form.value.minBalanceAmount;
    const rawTime = String(this.form.value.orderClosingTime ?? '').trim();
    const rawTimezone = String(this.form.value.timezone ?? '').trim();
    try {
      await this.repo.update('settings', 1, {
        managerName: this.form.value.managerName,
        minBalanceEnabled: !!this.form.value.minBalanceEnabled,
        minBalanceAmount: rawAmount == null || Number.isNaN(Number(rawAmount)) ? 20 : Number(rawAmount),
        orderClosingTime: rawTime || '16:20',
        timezone: this.timezones.includes(rawTimezone) ? rawTimezone : SettingsComponent.DEFAULT_TIMEZONE
      });
      this.message.add({ severity: 'success', summary: 'Settings saved', detail: 'Manager information and order settings updated' });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to save settings', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  goToOrders(): void {
    void this.router.navigateByUrl('/orders');
  }
}
