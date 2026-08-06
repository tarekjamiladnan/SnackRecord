import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
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
  constructor(repo: RepositoryService, dialog: MatDialog, snack: MatSnackBar, public override auth: SupabaseService) { super(repo, dialog, snack, auth); void this.load(); }
  override async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.repo.list<Member>('members', { search: this.search(), searchColumns: this.searchColumns, page: this.page(), pageSize: this.pageSize(), filters: { status: 'active' } });
      this.data.set(result.data);
      this.count.set(result.count);
    } finally { this.loading.set(false); }
  }
  async archive(row: Member, status: 'active' | 'archived'): Promise<void> {
    await this.repo.update<Member>('members', row.id, { status }, status === 'archived' ? 'Member Delete' : 'Member Restore');
    await this.load();
  }
  override delete(row: Member): Promise<void> {
    return new Promise<void>((resolve) => {
      const ref = this.dialog.open(ConfirmDialogComponent, { data: { title: 'Delete Member', message: 'Archives the member so their payment history is kept. They will no longer appear in new entries.', action: 'Delete' } });
      ref.afterClosed().subscribe(async (ok) => { if (ok) { await this.archive(row, 'archived'); } resolve(); });
    });
  }
}
