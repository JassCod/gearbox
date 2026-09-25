/**
 * NCR report files: the open / closed registers as PDF or Excel (XLSX), and the
 * single-NCR report as PDF. Loaded on demand so the PDF library isn't in the main bundle.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { strToU8, zipSync } from 'fflate';
import type { AppData, Ncr } from '../types';
import { ncrColumns } from '../pages/Ncrs';
import { fmtDMY, fmtDMYTime, NCR_STAGES, ncrCode, ncrHeaderFields } from './ncr';
import { downloadBlob } from './utils';

interface RegisterOptions {
  data: AppData;
  rows: Ncr[];
  closed: boolean;
  title: string;
  filters: string;
  fileName: string;
}

const TEAL: [number, number, number] = [15, 118, 110];
const INK: [number, number, number] = [21, 32, 43];
const GREY: [number, number, number] = [100, 116, 139];

function registerTable({ data, rows, closed }: Pick<RegisterOptions, 'data' | 'rows' | 'closed'>) {
  const cols = ncrColumns(data, closed);
  return { head: cols.map((c) => c.label), body: rows.map((r) => cols.map((c) => String(c.value(r)))) };
}

function pageFooter(doc: jsPDF, left: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(); const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(left, 12, h - 7);
    doc.text(`Page ${i} of ${pages}`, w - 12, h - 7, { align: 'right' });
  }
}

export async function registerPdf(o: RegisterOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...TEAL); doc.rect(0, 0, w, 3, 'F');
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(o.title, 12, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text(`${o.data.settings.companyName} · ${o.filters} · ${o.rows.length} record${o.rows.length === 1 ? '' : 's'}`, 12, 20);
  const { head, body } = registerTable(o);
  const problemIdx = head.indexOf('Problem');
  autoTable(doc, {
    head: [head], body, startY: 25, margin: { left: 12, right: 12, bottom: 14 },
    styles: { fontSize: 7.2, cellPadding: 1.6, overflow: 'linebreak', valign: 'top', textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 251] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 18 }, [problemIdx]: { cellWidth: 70 } },
  });
  if (!body.length) { doc.setFontSize(10); doc.setTextColor(...GREY); doc.text('No records match these filters.', 12, 40); }
  pageFooter(doc, `Generated ${fmtDMYTime(new Date().toISOString())} by Torqline`);
  doc.save(`${o.fileName}.pdf`);
}

// ---------- XLSX (Office Open XML, written by hand and zipped) ----------

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // Strip characters XML 1.0 does not allow.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export function buildXlsx(sheetName: string, head: string[], body: string[][], widths: number[]) {
  const rows = [head, ...body];
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) =>
    `<c r="${colName(ci)}${ri + 1}" t="inlineStr" s="${ri === 0 ? 1 : 2}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`).join('')}</row>`).join('');
  const lastCell = `${colName(head.length - 1)}${rows.length}`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(sheetName.slice(0, 31))}'!$A$1:$${colName(head.length - 1)}$${rows.length}</definedName></definedNames></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`),
  };
  return new Blob([zipSync(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function registerXlsx(o: RegisterOptions) {
  const { head, body } = registerTable(o);
  const widths = head.map((h) => (h === 'Problem' ? 70 : h === 'Employee' ? 28 : h === 'Category' ? 26 : h === 'Contractor' ? 26 : 16));
  downloadBlob(`${o.fileName}.xlsx`, buildXlsx(o.closed ? 'Closed NCRs' : 'Open NCRs', head, body, widths));
}

// ---------- Single NCR report ----------

export function ncrPdf(n: Ncr, data: AppData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const m = 14;
  doc.setFillColor(...TEAL); doc.rect(0, 0, w, 3, 'F');
  doc.setTextColor(...GREY); doc.setFontSize(9); doc.text(data.settings.companyName, m, 12);
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(`Non Conformance Report – ${ncrCode(n)}`, m, 20);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(n.closed ? [22, 163, 74] as [number, number, number] : [217, 119, 6] as [number, number, number]));
  doc.text(n.closed ? `CLOSED ${fmtDMY(n.closedDate)}` : 'OPEN / IN PROGRESS', w - m, 20, { align: 'right' });

  const fields = ncrHeaderFields(n, data);
  const rows: string[][] = [];
  for (let i = 0; i < fields.length; i += 3) rows.push(fields.slice(i, i + 3).flatMap(([k, v]) => [k, v || '—']));
  autoTable(doc, {
    body: rows, startY: 25, margin: { left: m, right: m }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.1 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 26 }, 2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 26 }, 4: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 26 } },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  for (const s of NCR_STAGES) {
    autoTable(doc, {
      startY: y, margin: { left: m, right: m }, theme: 'grid',
      head: [[{ content: s.title, colSpan: 4 }]],
      body: [
        [{ content: n[s.key] || '—', colSpan: 4, styles: { minCellHeight: 14, fontStyle: 'normal' } }],
        [s.dateLabel, fmtDMY(n[s.date]) || '—', s.byLabel, n[s.by] || '—'],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.1, valign: 'top' },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 2: { fontStyle: 'bold', cellWidth: 34 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }
  autoTable(doc, {
    startY: y + 1, margin: { left: m, right: m }, theme: 'grid',
    head: [[{ content: 'Closure', colSpan: 4 }]],
    body: [
      ['Closed date', fmtDMY(n.closedDate) || '—', 'Closed by', n.closedBy || '—'],
      ['Closed position', n.closedPosition || '—', 'Completed', n.closed ? 'Yes' : 'No'],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 2: { fontStyle: 'bold', cellWidth: 34 } },
  });
  const docs = data.attachments.filter((a) => a.entityType === 'ncr' && a.entityId === n.id);
  if (docs.length) {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    autoTable(doc, {
      startY: y, margin: { left: m, right: m }, theme: 'plain',
      head: [['Attached documents', 'Uploaded', 'By']],
      body: docs.map((a) => [a.name, fmtDMYTime(a.uploadedAt), a.uploadedBy]),
      styles: { fontSize: 8, cellPadding: 1.4, textColor: INK },
      headStyles: { fontStyle: 'bold', textColor: GREY },
    });
  }
  pageFooter(doc, `${ncrCode(n)} · printed ${fmtDMYTime(new Date().toISOString())}`);
  doc.save(`${ncrCode(n)}.pdf`);
}
