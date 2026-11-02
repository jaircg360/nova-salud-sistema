const PDFDocument = require('pdfkit');
const dinero = cents => 'S/ ' + (cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = value => value.split('-').reverse().join('/');
const texto = value => String(value ?? '').replace(/[\x00-\x1f]/g, ' ').slice(0, 300);

function generarPDF(data, usuario) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 42, bottom: 52, left: 42, right: 42 }, bufferPages: true, info: { Title: 'Nova Salud - Reporte de ventas e inventario', Author: 'Nova Salud' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const width = doc.page.width - 84;
      const bottom = () => doc.page.height - 58;
      const periodo = fecha(data.periodo.desde) + ' al ' + fecha(data.periodo.hasta);
      const stamp = new Date(data.generadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });
      function header() {
        doc.rect(0, 0, doc.page.width, 9).fill('#059669');
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a').text('NOVA SALUD', 42, 34);
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Reporte de ventas e inventario', 42, 60);
        doc.text('Periodo de ventas: ' + periodo + ' | Horario: Lima', 42, 77);
        doc.y = 101;
      }
      function nextPage() { doc.addPage(); header(); }
      function ensure(height) { if (doc.y + height > bottom()) nextPage(); }
      function paragraph(value) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b');
        const h = doc.heightOfString(value, { width });
        ensure(h + 14); doc.text(value, 42, doc.y, { width }); doc.y += 10;
      }
      function section(title) {
        ensure(70); doc.y += 8;
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#065f46').text(title, 42, doc.y);
        doc.y += 9;
      }
      function table(title, columns, rows) {
        section(title);
        const widths = columns.map(c => c.width * width);
        const drawRow = (values, heading, index) => {
          doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
          const heights = values.map((v, i) => doc.heightOfString(texto(v), { width: widths[i] - 14 }));
          const height = Math.max(heading ? 29 : 27, ...heights.map(h => h + 14));
          const y = doc.y;
          doc.rect(42, y, width, height).fill(heading ? '#047857' : index % 2 ? '#f1f5f9' : '#ffffff');
          let x = 42;
          values.forEach((v, i) => {
            doc.fillColor(heading ? '#ffffff' : '#334155').text(texto(v), x + 7, y + 7, { width: widths[i] - 14, align: columns[i].align || 'left' });
            x += widths[i];
          });
          doc.y = y + height;
        };
        drawRow(columns.map(c => c.label), true, 0);
        if (!rows.length) {
          doc.y += 10; paragraph('Sin registros para mostrar.');
          return;
        }
        rows.forEach((row, index) => {
          doc.font('Helvetica').fontSize(9);
          const height = Math.max(27, ...row.map((v, i) => doc.heightOfString(texto(v), { width: widths[i] - 14 }) + 14));
          if (doc.y + height > bottom()) {
            nextPage(); section(title + ' (continuación)');
            drawRow(columns.map(c => c.label), true, 0);
          }
          drawRow(row, false, index);
        });
        doc.y += 10;
      }
      header();
      paragraph('Generado: ' + stamp + ' | Solicitado por: ' + texto(usuario));
      table('Resumen de ventas', [
        { label: 'Importe vendido', width: 0.3 }, { label: 'Operaciones', width: 0.2 }, { label: 'Unidades', width: 0.2 }, { label: 'Venta promedio', width: 0.3 },
      ], [[dinero(data.ventas.totalCentavos), data.ventas.cantidadVentas, data.ventas.unidadesVendidas, dinero(data.ventas.ticketPromedioCentavos)]]);
      paragraph('Los importes corresponden a ventas. No representan ganancias ni incluyen costos de compra.');
      table('Ventas diarias', [{ label: 'Fecha', width: 0.3 }, { label: 'Operaciones', width: 0.2, align: 'right' }, { label: 'Unidades', width: 0.2, align: 'right' }, { label: 'Ventas', width: 0.3, align: 'right' }], data.porDia.map(r => [fecha(r.fecha), r.cantidadVentas, r.unidades, dinero(r.totalCentavos)]));
      table('Productos más vendidos - Top 10 por unidades', [{ label: 'Producto', width: 0.55 }, { label: 'Unidades', width: 0.15, align: 'right' }, { label: 'Ventas', width: 0.3, align: 'right' }], data.productosMasVendidos.map(r => [r.nombre, r.unidades, dinero(r.totalCentavos)]));
      table('Ventas por vendedor', [{ label: 'Vendedor', width: 0.4 }, { label: 'Operaciones', width: 0.2, align: 'right' }, { label: 'Unidades', width: 0.15, align: 'right' }, { label: 'Ventas', width: 0.25, align: 'right' }], data.vendedores.map(r => [r.nombre, r.cantidadVentas, r.unidades, dinero(r.totalCentavos)]));
      nextPage();
      section('Inventario actual');
      paragraph('Estado al generar el reporte (' + stamp + '). El inventario no se filtra por el periodo de ventas; no es un inventario histórico.');
      const inv = data.inventario.resumen;
      paragraph('Productos: ' + inv.productos + ' | Unidades: ' + inv.unidades + ' | Agotados: ' + inv.agotados + ' | Stock bajo: ' + inv.stockBajo);
      paragraph('Valor del stock a precio de venta: ' + dinero(inv.valorVentaCentavos) + '. Este valor no es el costo del inventario.');
      table('Existencias y reposición', [{ label: 'Producto', width: 0.36 }, { label: 'Stock', width: 0.10, align: 'right' }, { label: 'Mínimo', width: 0.11, align: 'right' }, { label: 'Reponer', width: 0.13, align: 'right' }, { label: 'Estado', width: 0.20 }], data.inventario.productos.map(p => [p.nombre, p.stock, p.stockMinimo, p.reponer, p.estado]));
      paragraph('Reponer indica las unidades necesarias para alcanzar el mínimo configurado. Si el stock ya coincide con el mínimo, la reposición indicada es 0.');
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Nova Salud | ' + periodo, 42, doc.page.height - 32, { width: width * 0.75, lineBreak: false });
        doc.text('Página ' + (i + 1) + ' de ' + range.count, 42 + width * 0.75, doc.page.height - 32, { width: width * 0.25, align: 'right', lineBreak: false });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { generarPDF };
