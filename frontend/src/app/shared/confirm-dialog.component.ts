import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { UI_IMPORTS } from './ui';

export interface ConfirmDialogData { title: string; message: string; requireText?: string; action: string; }

@Component({
  selector: 'app-confirm-dialog',
  imports: [...UI_IMPORTS, ReactiveFormsModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss'
})
export class ConfirmDialogComponent {
  typed = new FormControl('');
  data: ConfirmDialogData;

  constructor(public ref: DynamicDialogRef, private config: DynamicDialogConfig) {
    this.data = this.config.data as ConfirmDialogData;
  }
}
