import { ErrorHandler, Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private snack = inject(MatSnackBar);
  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof Error && error.message.includes('ExpressionChangedAfterItHasBeenChecked')) return;
    this.snack.open('Something went wrong. Please try again.', 'Close', {
      duration: 3000,
      panelClass: ['app-toast']
    });
  }
}
