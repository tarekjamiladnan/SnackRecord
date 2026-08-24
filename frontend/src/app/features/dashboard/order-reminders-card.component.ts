import { Component, OnInit, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';
import { PushService, PushSetupState } from '../../core/push.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-order-reminders-card',
  imports: UI_IMPORTS,
  templateUrl: './order-reminders-card.component.html',
  styleUrls: ['../../shared/page.scss', './order-reminders-card.component.scss']
})
export class OrderRemindersCardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  readonly push = inject(PushService);
  private readonly message = inject(MessageService);

  readonly testing = signal(false);
  readonly error = signal('');

  readonly hasTeam = () => !!this.auth.user()?.teamId;
  readonly isAdmin = () => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN';

  ngOnInit(): void {
    void this.push.refresh();
  }

  stateLabel(state: PushSetupState): string {
    switch (state) {
      case 'subscribed': return 'Order reminders are active on this device';
      case 'denied': return 'Notifications are blocked in your browser settings';
      case 'insecure': return 'Open the site over HTTPS to enable notifications';
      case 'unsupported': return 'This browser does not support push notifications';
      case 'not-configured': return 'Push notifications are not configured for this deployment yet';
      default: return 'Get notified before your deadline closes';
    }
  }

  async enable(): Promise<void> {
    this.error.set('');
    try {
      await this.push.enable();
      this.message.add({ severity: 'success', summary: 'Reminders enabled', detail: "You'll be notified 15 minutes before your order deadline." });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not enable notifications.');
    }
  }

  async disable(): Promise<void> {
    this.error.set('');
    try {
      await this.push.disable();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not disable notifications.');
    }
  }

  async sendTest(): Promise<void> {
    if (this.testing()) return;
    this.testing.set(true);
    this.error.set('');
    try {
      await this.push.sendTest();
      this.message.add({ severity: 'success', summary: 'Test sent', detail: 'Check this device for the test notification.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'The test notification failed.');
    } finally {
      this.testing.set(false);
    }
  }
}
