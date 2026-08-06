import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Menu } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseService } from '../../core/supabase.service';
import { EntityDialogComponent } from '../../shared/entity-dialog.component';
import { CrudPageBase } from '../../shared/crud-page.base';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-menu',
  imports: UI_IMPORTS,
  templateUrl: './menu.component.html',
  styleUrl: '../../shared/page.scss'
})
export class MenuComponent extends CrudPageBase<Menu> {
  title = 'Menu';
  table = 'menus';
  columns = ['name'];
  displayedColumns = ['sl', 'name', 'actions'];
  override searchColumns = ['name'];
  fields = [
    { key: 'name', label: 'Name', required: true }
  ];
  constructor(repo: RepositoryService, dialog: MatDialog, snack: MatSnackBar, auth: SupabaseService) { super(repo, dialog, snack, auth); void this.load(); }
  override open(row?: Menu): void {
    const ref = this.dialog.open(EntityDialogComponent, { width: '520px', data: { title: row ? 'Edit Menu' : 'Add Menu', fields: this.fields, value: row } });
    ref.afterClosed().subscribe(async (value) => {
      if (!value) return;
      const payload = { ...value, price: 0, status: 'active' };
      row ? await this.repo.update<Menu>(this.table, row.id, payload, 'Menu Update') : await this.repo.create<Menu>(this.table, payload, 'Menu Add');
      this.snack.open('Saved', 'Close', { duration: 2200, panelClass: ['app-toast'] });
      await this.load();
    });
  }
}
