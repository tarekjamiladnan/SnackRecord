import { Injectable } from '@angular/core';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';

@Injectable({ providedIn: 'root' })
export class MonthService {
  constructor(private workflow: SupabaseWorkflowService) {}
  async closeMonth(monthId: string): Promise<void> {
    await this.workflow.closeMonth(monthId);
  }
  async unlockMonth(monthId: string): Promise<void> {
    await this.workflow.unlockMonth(monthId);
  }
  async deleteMonth(monthId: string): Promise<void> {
    await this.workflow.deleteMonth(monthId);
  }
}
