import { Component, ViewChild, signal } from '@angular/core';
import { MenuItem, MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Menu } from 'primeng/menu';
import { Member } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseService } from '../../core/supabase.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { CrudPageBase } from '../../shared/crud-page.base';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-members',
  imports: UI_IMPORTS,
  templateUrl: './members.component.html',
  styleUrl: '../../shared/page.scss'
})
export class MembersComponent extends CrudPageBase<Member> {
  title = 'Member';
  table = 'members';
  columns = ['name', 'phone'];
  displayedColumns = [...this.columns, 'actions'];
  override searchColumns = ['name', 'phone'];
  fields = [
    { key: 'name', label: 'Name', required: true },
    { key: 'phone', label: 'Number' }
  ];
  menuItems = signal<MenuItem[]>([]);
  @ViewChild('rowMenu') rowMenu?: Menu;

  constructor(
    repo: RepositoryService,
    dialog: DialogService,
    message: MessageService,
    public override auth: SupabaseService
  ) {
    super(repo, dialog, message, auth);
    void this.load();
  }

  override async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.repo.list<Member>('members', {
        search: this.search(),
        searchColumns: this.searchColumns,
        page: this.page(),
        pageSize: this.pageSize(),
        filters: { status: 'active' }
      });
      this.data.set(result.data);
      this.count.set(result.count);
    } finally {
      this.loading.set(false);
    }
  }

  async archive(row: Member, status: 'active' | 'archived'): Promise<void> {
    await this.repo.update<Member>('members', row.id, { status }, status === 'archived' ? 'Member Delete' : 'Member Restore');
    await this.load();
  }

  override delete(row: Member): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Member',
      width: '460px',
      data: {
        title: 'Delete Member',
        message: 'Archives the member so their payment history is kept. They will no longer appear in new entries.',
        action: 'Delete'
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (ok) => {
      if (ok) await this.archive(row, 'archived');
    });
  }

  initials(name?: string): string {
    return (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  openRowMenu(event: Event, row: Member): void {
    const items: MenuItem[] = [{ label: 'Edit Member', icon: 'pi pi-pencil', command: () => this.open(row) }];
    if (this.auth.profile()?.role === 'admin') {
      items.push({ label: 'Delete Member', icon: 'pi pi-trash', command: () => this.delete(row) });
    }
    this.menuItems.set(items);
    this.rowMenu?.toggle(event);
  }
}
