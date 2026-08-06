import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
  constructor(public ref: MatDialogRef<ConfirmDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData) {}
}
