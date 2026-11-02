import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';

// Renders the document model of report-model.js / assessment.js as plain text and as a PDF with tables.
export function renderText(doc) {
  const out = [doc.title, doc.subtitle, doc.status, ''];
  for (const section of doc.sections) {
    if (section.title) out.push(`== ${section.title} ==`);
    for (const paragraph of section.paragraphs || []) out.push(paragraph);
    for (const [label, value] of section.items || []) out.push(`${label}: ${value}`);
    if (section.table) {
      out.push(section.table.head.filter(Boolean).length ? section.table.head.join(' | ') : '');
      for (const row of section.table.rows) out.push(row.join(' | '));
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const firstExisting = paths => paths.find(path => path && existsSync(path));
const colors = { brand: '#6951db', ink: '#292332', muted: '#867393', body: '#51465c', panel: '#f3eef9', line: '#e3dcef' };

export function renderPdf(doc, { author, title }) {
  return new Promise((resolve, reject) => {
    const regular = firstExisting([process.env.PDF_FONT_PATH, 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']);
    if (!regular) { reject(new Error('PDF_FONT_REQUIRED')); return; }
    const bold = firstExisting([process.env.PDF_FONT_BOLD_PATH, 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']) || regular;
    const pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: title, Author: author } }), chunks = [];
    pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject);
    const left = 48, width = pdf.page.width - 96, bottom = pdf.page.height - 70;
    const ensure = height => { if (pdf.y + height > bottom) { pdf.addPage(); pdf.x = left; } };

    // Cover
    pdf.font(bold).fillColor(colors.brand).fontSize(20).text('equitensa', left, 48);
    pdf.moveDown(2).font(regular).fillColor(colors.muted).fontSize(9).text(doc.subtitle.toUpperCase(), left);
    pdf.moveDown(0.8).font(bold).fillColor(colors.ink).fontSize(25).text(doc.title, left, pdf.y, { width });
    pdf.moveDown(0.8).font(regular).fillColor(colors.body).fontSize(13).text(doc.coverLine || '', left, pdf.y, { width });
    pdf.moveDown(0.5).fontSize(10.5).fillColor(colors.body).text(doc.recipientLine || '', left, pdf.y, { width });
    pdf.moveDown(0.6).fontSize(9).fillColor('#9d7892').text(doc.status, left, pdf.y, { width });
    if (doc.keyFigures?.length) {
      const top = pdf.y + 28, boxWidth = (width - 14) / 2;
      doc.keyFigures.slice(0, 2).forEach(([label, value], i) => {
        const x = left + i * (boxWidth + 14);
        pdf.roundedRect(x, top, boxWidth, 96, 10).fill(colors.panel);
        pdf.fillColor('#8a739d').font(regular).fontSize(9).text(label, x + 16, top + 16, { width: boxWidth - 32 });
        pdf.fillColor(colors.brand).font(bold).fontSize(26).text(value, x + 16, top + 46, { width: boxWidth - 32 });
      });
      pdf.y = top + 120;
    }
    pdf.addPage();

    const paragraph = text => { pdf.font(regular).fontSize(9.5).fillColor(colors.body); ensure(pdf.heightOfString(text, { width }) + 6); pdf.text(text, left, pdf.y, { width, lineGap: 2.5 }); pdf.moveDown(0.5); };
    const items = list => {
      for (const [label, value] of list) {
        pdf.font(regular).fontSize(9.5);
        const labelWidth = width * 0.4, valueWidth = width * 0.6 - 8, height = Math.max(pdf.heightOfString(String(label), { width: labelWidth }), pdf.heightOfString(String(value), { width: valueWidth })) + 6;
        ensure(height);
        const y = pdf.y;
        pdf.fillColor(colors.muted).text(String(label), left, y, { width: labelWidth });
        pdf.font(bold).fillColor(colors.ink).text(String(value), left + labelWidth + 8, y, { width: valueWidth });
        pdf.y = y + height; pdf.x = left;
      }
      pdf.moveDown(0.4);
    };
    const table = ({ head, rows, widths }) => {
      const cols = (widths || head.map(() => 1 / head.length)).map(w => w * width);
      const cell = (cells, y, height, header) => {
        let x = left;
        if (header) pdf.rect(left, y, width, height).fill(colors.panel);
        cells.forEach((text, i) => { pdf.font(header ? bold : regular).fontSize(8.5).fillColor(header ? colors.brand : colors.body).text(String(text ?? ''), x + 4, y + 5, { width: cols[i] - 8 }); x += cols[i]; });
        pdf.moveTo(left, y + height).lineTo(left + width, y + height).lineWidth(0.5).strokeColor(colors.line).stroke();
      };
      const heightOf = (cells, header) => Math.max(...cells.map((text, i) => { pdf.font(header ? bold : regular).fontSize(8.5); return pdf.heightOfString(String(text ?? ''), { width: cols[i] - 8 }); })) + 10;
      const hasHead = head.some(Boolean);
      if (hasHead) { const h = heightOf(head, true); ensure(h + 24); const y = pdf.y; cell(head, y, h, true); pdf.y = y + h; }
      for (const row of rows) {
        const h = heightOf(row, false);
        if (pdf.y + h > bottom) { pdf.addPage(); if (hasHead) { const hh = heightOf(head, true), y0 = pdf.y; cell(head, y0, hh, true); pdf.y = y0 + hh; } }
        const y = pdf.y; cell(row, y, h, false); pdf.y = y + h;
      }
      pdf.x = left; pdf.moveDown(0.8);
    };

    for (const section of doc.sections) {
      ensure(60);
      if (section.title) { pdf.font(bold).fontSize(12).fillColor(colors.brand).text(section.title, left, pdf.y, { width }); pdf.moveDown(0.4); }
      for (const text of section.paragraphs || []) paragraph(text);
      if (section.items?.length) items(section.items);
      if (section.table) table(section.table);
      pdf.moveDown(0.3);
    }
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      pdf.font(regular).fontSize(8).fillColor('#a092af').text(`Equitensa · ${title} · ${i + 1} / ${range.count}`, left, 798, { lineBreak: false });
    }
    pdf.end();
  });
}
