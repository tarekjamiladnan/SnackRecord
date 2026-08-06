import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../core/supabase.service';
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
    private supabase: SupabaseService,
    private message: MessageService
  ) {
    this.form = this.fb.group({ manager_name: ['', Validators.required] });
    void this.load();
  }

  async load(): Promise<void> {
    const { data } = await this.supabase.client.from('settings').select('manager_name').eq('id', 1).single();
    if (data) this.form.patchValue(data);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const { error } = await this.supabase.client.from('settings').upsert({
      id: 1,
      manager_name: this.form.value.manager_name,
      company_name: 'Snack Record',
      currency: 'BDT',
      logo_url: null
    });
    if (error) throw error;
    this.message.add({ severity: 'success', summary: 'Settings saved', detail: 'Manager information updated' });
  }
}
