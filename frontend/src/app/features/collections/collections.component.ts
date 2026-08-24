import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { Member } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { RepositoryService } from '../../core/repository.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-collections',
  imports: UI_IMPORTS,
  templateUrl: './collections.component.html',
  styleUrl: '../../shared/page.scss'
})
export class CollectionsComponent {
  members = signal<Member[]>([]);
  collections = signal<any[]>([]);
  columns = ['member', 'amount', 'date'];
  memberId = '';
  amount: number | null = null;
  date = new Date().toISOString().slice(0, 10);
  dateValue = new Date();

  constructor(
    private auth: AuthService,
    private repo: RepositoryService,
    private message: MessageService,
    private router: Router
  ) {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const [membersResult, collectionsResult] = await Promise.all([
        this.repo.list<Member>('members', { filters: { status: 'active' }, orderBy: 'name' }),
        this.repo.list<any>('collections', { orderBy: 'date', ascending: false, pageSize: 50 })
      ]);
      this.members.set(membersResult.data);
      this.collections.set(collectionsResult.data);
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to load data', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async save(): Promise<void> {
    if (!this.memberId || !this.amount) return;
    try {
      await this.repo.create('collections', {
        memberId: this.memberId,
        amount: Number(this.amount),
        date: this.date,
        remarks: null
      });
      this.amount = null;
      this.message.add({ severity: 'success', summary: 'Collection saved', detail: 'Money received and recorded' });
      await this.load();
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to save', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  setDate(value: Date | string | null): void {
    if (!value) return;
    const date = value instanceof Date ? value : new Date(value);
    this.dateValue = date;
    this.date = this.toIsoDate(date);
  }

  visibleTotal(): number {
    return this.collections().reduce((total, row) => total + Number(row.amount ?? 0), 0);
  }

  initials(name?: string): string {
    return (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  private notifyNoOpenMonth(): void {
    this.message.add({
      key: 'no-month',
      severity: 'warn',
      summary: 'No open month',
      detail: 'Create a new month before saving collections.',
      sticky: true
    });
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
