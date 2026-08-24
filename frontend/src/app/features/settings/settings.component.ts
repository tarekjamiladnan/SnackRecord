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
      orderClosingTime: ['16:20', [Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]]
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
          orderClosingTime: settings.orderClosingTime || '16:20'
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
    try {
      await this.repo.update('settings', 1, {
        managerName: this.form.value.managerName,
        minBalanceEnabled: !!this.form.value.minBalanceEnabled,
        minBalanceAmount: rawAmount == null || Number.isNaN(Number(rawAmount)) ? 20 : Number(rawAmount),
        orderClosingTime: rawTime || '16:20'
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
