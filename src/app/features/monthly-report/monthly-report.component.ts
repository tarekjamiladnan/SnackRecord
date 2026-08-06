import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

interface ReportRow { person: string; opening: number; given: number; used: number; left: number; }

@Component({
  selector: 'app-monthly-report',
  imports: UI_IMPORTS,
  templateUrl: './monthly-report.component.html',
  styleUrl: '../../shared/page.scss'
})
export class MonthlyReportComponent {
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  rows: ReportRow[] = [];
  previewLoading = signal(false);
  columns: { key: keyof ReportRow; label: string }[] = [
    { key: 'person', label: 'Person' },
    { key: 'opening', label: 'Opening (Prev. Left)' },
    { key: 'given', label: 'Given' },
    { key: 'used', label: 'Used' },
    { key: 'left', label: 'Left' }
  ];

  monthOptions = Array.from({ length: 12 }, (_, index) => ({
    label: new Date(2000, index, 1).toLocaleString('default', { month: 'long' }),
    value: index + 1
  }));

  yearOptions = Array.from({ length: 7 }, (_, index) => {
    const value = this.year + index - 2;
    return { label: String(value), value };
  });

  constructor(private supabase: SupabaseService, private message: MessageService) {
    void this.refreshPreview();
  }

  monthName(): string {
    return new Date(this.year, this.month - 1, 1).toLocaleString('default', { month: 'long' });
  }

  async refreshPreview(): Promise<void> {
    this.previewLoading.set(true);
    try {
      await this.load();
    } finally {
      this.previewLoading.set(false);
    }
  }

  async load(): Promise<void> {
    const { data: months } = await this.supabase.client.from('months').select('id').eq('month', this.month).eq('year', this.year).limit(1);
    if (!months?.length) {
      this.rows = [];
      return;
    }
    const monthId = months[0].id;
    const [{ data: members }, { data: balances }, { data: collections }, { data: entryItems }] = await Promise.all([
      this.supabase.client.from('members').select('id,name').eq('status', 'active').order('name'),
      this.supabase.client.from('member_month_balances').select('member_id,opening_balance').eq('month_id', monthId),
      this.supabase.client.from('collections').select('member_id,amount').eq('month_id', monthId),
      this.supabase.client.from('entry_items').select('member_id,amount,daily_entries!inner(month_id)').eq('daily_entries.month_id', monthId)
    ]);
    const opening = new Map<string, number>();
    const collected = new Map<string, number>();
    const used = new Map<string, number>();
    for (const item of balances ?? []) opening.set(item.member_id, Number(item.opening_balance));
    for (const item of collections ?? []) collected.set(item.member_id, (collected.get(item.member_id) ?? 0) + Number(item.amount));
    for (const item of entryItems ?? []) used.set(item.member_id, (used.get(item.member_id) ?? 0) + Number(item.amount));
    this.rows = (members ?? []).map((member) => {
      const open = opening.get(member.id) ?? 0;
      const given = open + (collected.get(member.id) ?? 0);
      const consumed = used.get(member.id) ?? 0;
      return { person: member.name, opening: open, given, used: consumed, left: given - consumed };
    });
  }

  total(key: keyof ReportRow): number {
    return this.rows.reduce((sum, row) => sum + (typeof row[key] === 'number' ? Number(row[key]) : 0), 0);
  }

  async loadAndDownload(isPdf: boolean): Promise<void> {
    await this.load();
    if (!this.rows.length) {
      this.message.add({ severity: 'warn', summary: 'No report data', detail: 'There is no data for this month' });
      return;
    }
    if (isPdf) this.downloadPdf();
    else this.downloadXlsx();
  }

  private downloadPdf(): void {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor('#172033');
    doc.text('Monthly Report', 14, 16);
    doc.setFontSize(11);
    doc.setTextColor('#64748b');
    doc.text(`${this.monthName()} ${this.year}`, 14, 24);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [this.columns.map((column) => column.label)],
      body: this.rows.map((row) => this.columns.map((column) => (column.key === 'person' ? row.person : row[column.key].toFixed(2)))),
      theme: 'grid',
      headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 2.5 }
    });
    doc.save(`monthly-report-${this.year}-${this.month}.pdf`);
  }

  private downloadXlsx(): void {
    const header = this.columns.map((column) => `<th>${this.escape(column.label)}</th>`).join('');
    const body = this.rows
      .map((row) => `<tr>${this.columns.map((column) => `<td>${column.key === 'person' ? this.escape(row.person) : row[column.key].toFixed(2)}</td>`).join('')}</tr>`)
      .join('');
    const workbook = `<html><head><meta charset="utf-8"><title>Monthly Report ${this.monthName()} ${this.year}</title></head><body><h2>Monthly Report - ${this.monthName()} ${this.year}</h2><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    this.download(workbook, `monthly-report-${this.year}-${this.month}.xls`, 'application/vnd.ms-excel');
  }

  private download(data: BlobPart, name: string, type: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  }
}
