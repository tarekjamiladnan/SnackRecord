import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ApiService } from '../../core/api.service';
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

  constructor(private api: ApiService, private message: MessageService) {
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
    try {
      const response = await this.api.get<{ data?: ReportRow[] }>('/reports/monthly', {
        month: this.month,
        year: this.year
      });
      this.rows = response.data ?? (response as unknown as ReportRow[]);
    } catch (err) {
      this.rows = [];
      this.message.add({ severity: 'error', summary: 'Failed to load report', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
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
