import { Component, Inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UI_IMPORTS } from './ui';

export interface FieldConfig { key: string; label: string; type?: 'text' | 'number' | 'date' | 'select'; required?: boolean; options?: { label: string; value: string }[]; }
export interface EntityDialogData { title: string; fields: FieldConfig[]; value?: Record<string, unknown>; }

@Component({
  selector: 'app-entity-dialog',
  imports: UI_IMPORTS,
  templateUrl: './entity-dialog.component.html',
  styleUrl: './entity-dialog.component.scss'
})
export class EntityDialogComponent {
  form;
  constructor(private fb: FormBuilder, public ref: MatDialogRef<EntityDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: EntityDialogData) {
    this.form = this.fb.group({});
    for (const field of data.fields) {
      this.form.addControl(field.key, this.fb.control(data.value?.[field.key] ?? '', field.required ? Validators.required : []));
    }
  }
  save(): void {
    this.ref.close(this.form.getRawValue());
  }
}
