import { Component, ViewChild, signal } from '@angular/core';
import { MenuItem, MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Menu } from 'primeng/menu';
import { Member } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { CrudPageBase } from '../../shared/crud-page.base';
import { EntityDialogComponent, FieldConfig } from '../../shared/entity-dialog.component';
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
  override searchColumns = ['name', 'email', 'phone'];
  fields: FieldConfig[] = [
    { key: 'name', label: 'Full Name', required: true },
    { key: 'email', label: 'Email Address', type: 'email', required: true },
    { key: 'phone', label: 'Phone Number' },
    { key: 'initial_password', label: 'Initial Password', type: 'password', required: true }
  ];
  menuItems = signal<MenuItem[]>([]);
  @ViewChild('rowMenu') rowMenu?: Menu;

  constructor(
    repo: RepositoryService,
    dialog: DialogService,
    message: MessageService,
    public override auth: AuthService,
    private supabase: SupabaseService
  ) {
    super(repo, dialog, message, auth);
    void this.load();
  }

  override async open(row?: Member): Promise<void> {
    const isEdit = !!row;
    const fields: FieldConfig[] = [
      { key: 'name', label: 'Full Name', required: true },
      { key: 'email', label: 'Email Address', type: 'email', required: true },
      { key: 'phone', label: 'Phone Number' },
      {
        key: 'initial_password',
        label: isEdit ? 'New Password (leave empty to keep)' : 'Initial Password',
        type: 'password',
        required: !isEdit
      }
    ];
    this.fields = fields;
    const ref = this.dialog.open(EntityDialogComponent, {
      header: isEdit ? 'Edit Member' : 'Add Member',
      width: '520px',
      data: {
        title: isEdit ? 'Edit Member' : 'Add Member',
        fields,
        value: row ?? {}
      }
    });
    ref?.onClose.subscribe(async (value) => {
      if (!value) return;
      await this.saveMember(value, isEdit, row?.id);
    });
  }

  private async saveMember(value: Record<string, unknown>, isEdit: boolean, id?: string): Promise<void> {
    const name = String(value['name'] ?? '').trim();
    const email = String(value['email'] ?? '').trim().toLowerCase();
    if (!name || !email) {
      this.message.add({ severity: 'warn', summary: 'Missing info', detail: 'Name and email are required.' });
      return;
    }
    const password = String(value['initial_password'] ?? '').trim();
    if (!isEdit && password.length < 6) {
      this.message.add({ severity: 'warn', summary: 'Password too short', detail: 'Password must be at least 6 characters.' });
      return;
    }
    if (password && password.length < 6) {
      this.message.add({ severity: 'warn', summary: 'Password too short', detail: 'Password must be at least 6 characters.' });
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      email,
      phone: String(value['phone'] ?? '').trim() || null
    };
    if (password) payload['password'] = password;

    try {
      if (isEdit && id) {
          await this.supabase.manageMember({ name, email, phone: payload['phone'] as string | null, password, memberId: id });
        this.message.add({
          severity: 'success',
          summary: 'Member updated',
          detail: `${name} updated successfully.`
        });
      } else {
          await this.supabase.manageMember({ name, email, phone: payload['phone'] as string | null, password });
        this.message.add({
          severity: 'success',
          summary: 'Member added',
          detail: `${name} can now log in with the initial password.`
        });
      }
      await this.load();
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: isEdit ? 'Member update failed' : 'Member save failed',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
    }
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
      this.count.set(result.total);
    } finally {
      this.loading.set(false);
    }
  }

  async archive(row: Member, status: 'active' | 'archived'): Promise<void> {
    await this.repo.update<Member>('members', row.id, { status });
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

  canManageMembers(): boolean {
    const role = this.auth.user()?.role;
    return role === 'MEMBER' || role === 'TEAM_ADMIN' || role === 'SUPER_ADMIN';
  }

  openRowMenu(event: Event, row: Member): void {
    if (!this.canManageMembers()) return;
    const items: MenuItem[] = [
      { label: 'Edit Member', icon: 'pi pi-pencil', command: () => this.open(row) },
      { label: 'Delete Member', icon: 'pi pi-trash', command: () => this.delete(row) }
    ];
    this.menuItems.set(items);
    this.rowMenu?.toggle(event);
  }
}
