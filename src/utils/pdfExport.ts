// src/utils/pdfExport.ts
// Client-side PDF generation using jsPDF (loaded from CDN via dynamic import)
// Usage: import { exportTransactionsPDF } from '../utils/pdfExport'

import { Transaction, Person } from '../types';
import { formatCurrency } from './money';

export interface PDFExportOptions {
  person?: Person | null;
  transactions: Transaction[];
  exportedBy?: string;
}

const formatDateStr = (date: Date) => {
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const todayStr = () =>
  new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const filenameDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Dynamically load jsPDF from CDN to avoid bundling issues
async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF;
  if ((window as any).jsPDF) return (window as any).jsPDF;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(script);
  });

  return (window as any).jspdf?.jsPDF || (window as any).jsPDF;
}

export async function exportTransactionsPDF(options: PDFExportOptions): Promise<void> {
  const { person, transactions, exportedBy = 'Unknown' } = options;

  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  let y = 18;

  // ─── Colour helpers ───────────────────────────────────────────────────────
  const setFill = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const setDraw = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };
  const setTextColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);

  // ─── Header band ─────────────────────────────────────────────────────────
  setFill(16, 185, 129); // emerald-500
  doc.rect(0, 0, pageW, 28, 'F');

  setTextColor(255, 255, 255);
  setFont(20, 'bold');
  doc.text('Sarkia', marginL, 13);

  setFont(9, 'normal');
  doc.text('Shared Financial Records', marginL, 20);

  setFont(9, 'normal');
  const exportLabel = `Exported: ${todayStr()}  |  By: ${exportedBy}`;
  doc.text(exportLabel, pageW - marginR, 13, { align: 'right' });

  y = 36;

  // ─── Person info block ───────────────────────────────────────────────────
  if (person) {
    setFill(240, 253, 244); // green-50
    setDraw(187, 247, 208); // green-200
    doc.setLineWidth(0.3);
    doc.roundedRect(marginL, y, contentW, person.notes ? 22 : 16, 2, 2, 'FD');

    setTextColor(17, 94, 59); // green-900
    setFont(12, 'bold');
    doc.text(person.name, marginL + 4, y + 7);

    if (person.phone) {
      setFont(8, 'normal');
      setTextColor(22, 101, 52);
      doc.text(`Phone: ${person.phone}`, marginL + 4, y + 13);
    }

    if (person.notes) {
      setFont(8, 'normal');
      setTextColor(22, 101, 52);
      doc.text(`Notes: ${person.notes}`, marginL + 4, y + 19);
    }

    y += (person.notes ? 22 : 16) + 8;
  }

  // ─── Section title ────────────────────────────────────────────────────────
  setTextColor(15, 23, 42);
  setFont(11, 'bold');
  doc.text('Transaction History', marginL, y);

  // line under title
  setDraw(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(marginL, y + 2, pageW - marginR, y + 2);
  y += 8;

  // ─── Table setup ─────────────────────────────────────────────────────────
  const colWidths = {
    sr: 10,
    date: 22,
    desc: 0, // fill remaining
    category: 22,
    amount: 24,
    type: 20,
    by: 22,
  };
  // compute desc width
  colWidths.desc =
    contentW - colWidths.sr - colWidths.date - colWidths.category - colWidths.amount - colWidths.type - colWidths.by;

  const cols = [
    { key: 'sr', label: 'Sr.', w: colWidths.sr },
    { key: 'date', label: 'Date', w: colWidths.date },
    { key: 'desc', label: 'Description', w: colWidths.desc },
    { key: 'category', label: 'Category', w: colWidths.category },
    { key: 'amount', label: 'Amount', w: colWidths.amount },
    { key: 'type', label: 'Type', w: colWidths.type },
    { key: 'by', label: 'Added By', w: colWidths.by },
  ];

  const rowH = 8;
  const headerH = 9;

  // Header row
  let cx = marginL;
  setFill(15, 118, 110); // teal-700
  doc.rect(cx, y, contentW, headerH, 'F');
  setTextColor(255, 255, 255);
  setFont(7, 'bold');

  for (const col of cols) {
    doc.text(col.label, cx + 2, y + 6);
    cx += col.w;
  }
  y += headerH;

  // ─── Table rows ───────────────────────────────────────────────────────────
  // Only non-deleted, sorted by sequenceNumber ascending
  const visibleTx = transactions
    .filter((t) => !t.deleted)
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

  let totalGiven = 0;
  let totalReceived = 0;

  visibleTx.forEach((tx, idx) => {
    // page break
    if (y + rowH > pageH - 40) {
      doc.addPage();
      y = 18;

      // re-draw header on new page
      cx = marginL;
      setFill(15, 118, 110);
      doc.rect(cx, y, contentW, headerH, 'F');
      setTextColor(255, 255, 255);
      setFont(7, 'bold');
      for (const col of cols) {
        doc.text(col.label, cx + 2, y + 6);
        cx += col.w;
      }
      y += headerH;
    }

    const isGiven = tx.type === 'given';
    const bgEven = idx % 2 === 0;

    // row background
    if (bgEven) {
      setFill(248, 250, 252);
    } else {
      setFill(255, 255, 255);
    }
    doc.rect(marginL, y, contentW, rowH, 'F');

    // row border bottom
    setDraw(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(marginL, y + rowH, pageW - marginR, y + rowH);

    setFont(7, 'normal');
    cx = marginL;

    const cells: string[] = [
      String(tx.sequenceNumber ?? idx + 1),
      formatDateStr(tx.date),
      tx.description || tx.comment || '—',
      tx.category || 'General',
      formatCurrency(tx.amount),
      isGiven ? 'Given' : 'Received',
      tx.addedByName || '—',
    ];

    cells.forEach((cell, ci) => {
      const col = cols[ci];
      const cellText = doc.splitTextToSize(cell, col.w - 3);

      // colour amount by type
      if (ci === 4) {
        setTextColor(isGiven ? 220 : 22, isGiven ? 38 : 163, isGiven ? 38 : 74);
      } else if (ci === 5) {
        setTextColor(isGiven ? 154 : 21, isGiven ? 52 : 128, isGiven ? 4 : 61);
      } else {
        setTextColor(15, 23, 42);
      }

      doc.text(cellText[0], cx + 2, y + 5.5);
      cx += col.w;
    });

    if (isGiven) totalGiven += tx.amount;
    else totalReceived += tx.amount;

    y += rowH;
  });

  y += 10;

  // ─── Summary band ────────────────────────────────────────────────────────
  if (y + 38 > pageH) {
    doc.addPage();
    y = 18;
  }

  setFont(10, 'bold');
  setTextColor(15, 23, 42);
  doc.text('Summary', marginL, y);
  y += 6;

  const summaryItems = [
    { label: 'Total Given (Expense)', value: formatCurrency(totalGiven), r: 220, g: 38, b: 38 },
    { label: 'Total Received (Income)', value: formatCurrency(totalReceived), r: 22, g: 163, b: 74 },
    {
      label: 'Net Balance',
      value: formatCurrency(Math.abs(totalGiven - totalReceived)),
      r: totalGiven >= totalReceived ? 220 : 22,
      g: totalGiven >= totalReceived ? 38 : 163,
      b: totalGiven >= totalReceived ? 38 : 74,
    },
  ];

  summaryItems.forEach(({ label, value, r, g, b }) => {
    setFill(248, 250, 252);
    setDraw(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginL, y, contentW, 10, 1.5, 1.5, 'FD');

    setFont(8, 'normal');
    setTextColor(71, 85, 105);
    doc.text(label, marginL + 4, y + 6.5);

    setFont(9, 'bold');
    setTextColor(r, g, b);
    doc.text(value, pageW - marginR - 4, y + 6.5, { align: 'right' });

    y += 13;
  });

  // ─── Footer ───────────────────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setFont(7, 'normal');
    setTextColor(148, 163, 184);
    doc.text(`Sarkia  •  Page ${i} of ${totalPages}  •  Generated ${todayStr()}`, pageW / 2, pageH - 8, {
      align: 'center',
    });
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  const personSlug = person ? `_${person.name.replace(/\s+/g, '_')}` : '';
  doc.save(`Sarkia_Transactions${personSlug}_${filenameDateStr()}.pdf`);
}
