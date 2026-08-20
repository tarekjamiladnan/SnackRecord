import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';

@Injectable({ providedIn: 'root' })
export class MonthService {
  constructor(private api: ApiService) {}
  async closeMonth(monthId: string): Promise<void> {
    await this.api.post(`/months/${monthId}/close`);
  }
  async unlockMonth(monthId: string): Promise<void> {
    await this.api.put(`/months/${monthId}`, { status: 'open', closedAt: null });
  }
  async deleteMonth(monthId: string): Promise<void> {
    await this.api.delete(`/months/${monthId}`);
  }
}
