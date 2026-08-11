import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { UI_IMPORTS } from './ui';

export interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'email' | 'password';
  required?: boolean;
  options?: { label: string; value: string }[];
}
export interface EntityDialogData { title: string; fields: FieldConfig[]; value?: Record<string, unknown>; }

@Component({
  selector: 'app-entity-dialog',
  imports: [...UI_IMPORTS],
  templateUrl: './entity-dialog.component.html',
  styleUrl: './entity-dialog.component.scss'
})
export class EntityDialogComponent {
  form;
  data: EntityDialogData;

  constructor(private fb: FormBuilder, public ref: DynamicDialogRef, private config: DynamicDialogConfig) {
    this.data = this.config.data as EntityDialogData;
    this.form = this.fb.group({});
    for (const field of this.data.fields) {
      this.form.addControl(field.key, this.fb.control(this.data.value?.[field.key] ?? '', field.required ? Validators.required : []));
    }
  }

  save(): void {
    this.ref.close(this.form.getRawValue());
  }
}
