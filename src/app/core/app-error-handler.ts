import { ErrorHandler, Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private message = inject(MessageService);
  private lastShownAt = 0;

  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof Error && error.message.includes('ExpressionChangedAfterItHasBeenChecked')) return;

    const now = Date.now();
    if (now - this.lastShownAt < 5000) return;
    this.lastShownAt = now;

    this.message.add({ severity: 'error', summary: 'Something went wrong', detail: 'Please try again.' });
  }
}
