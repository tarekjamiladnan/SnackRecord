import { Component } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Expense } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { AuthService } from '../../core/auth.service';
import { CrudPageBase } from '../../shared/crud-page.base';
import { UI_IMPORTS } from '../../shared/ui';

@Component({ selector: 'app-expenses', imports: UI_IMPORTS, templateUrl: '../../shared/crud-template.html', styleUrl: '../../shared/page.scss' })
export class ExpensesComponent extends CrudPageBase<Expense> {
  title = 'Expense';
  table = 'expenses';
  columns = ['date', 'item', 'amount', 'remarks'];
  displayedColumns = [...this.columns, 'actions'];
  override searchColumns = ['item', 'remarks'];
  fields = [
    { key: 'date', label: 'Date', type: 'date' as const, required: true },
    { key: 'item', label: 'Item', required: true },
    { key: 'amount', label: 'Amount', type: 'number' as const, required: true },
    { key: 'remarks', label: 'Remarks' }
  ];
  constructor(repo: RepositoryService, dialog: DialogService, message: MessageService, auth: AuthService) { super(repo, dialog, message, auth); void this.load(); }
}
