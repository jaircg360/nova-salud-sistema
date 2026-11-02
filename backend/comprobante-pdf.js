const PDFDocument = require('pdfkit');
const dinero = n => 'S/ ' + (n / 100).toFixed(2);
const safe = value => String(value).replace(/[\x00-\x1f]/g, ' ').slice(0, 300);

function generarComprobante(venta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 30, bufferPages: true, info: { Title: 'Nova Salud - ' + venta.numero, Author: 'Nova Salud' } });
    const chunks = [];
    doc.on('data', data => chunks.push(data));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const width = doc.page.width - 60;
      const columns = [0.47, 0.10, 0.20, 0.23].map(v => v * width);
      function header() {
        doc.rect(0, 0, doc.page.width, 7).fill('#059669');
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text('NOVA SALUD', 30, 25);
        doc.font('Helvetica').fontSize(9).fillColor('#475569').text('Comprobante interno ' + venta.numero, 30, 50);
        doc.text(new Date(venta.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false }) + ' | Lima', 30, 65);
        doc.text('Vendedor: ' + safe(venta.vendedor), 30, 81, { width });
        doc.y += 12;
      }
      const bottom = () => doc.page.height - 52;
      function row(values, heading = false) {
        doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        const height = Math.max(26, ...values.map((v,i) => doc.heightOfString(safe(v), { width: columns[i] - 10 }) + 14));
        if (doc.y + height > bottom()) { doc.addPage(); header(); row(['Producto', 'Cant.', 'P. unit.', 'Importe'], true); }
        doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        const y = doc.y;
        doc.rect(30, y, width, height).fill(heading ? '#047857' : '#f1f5f9');
        let x = 30;
        values.forEach((v,i) => { doc.fillColor(heading ? '#ffffff' : '#334155').text(safe(v), x + 5, y + 7, { width: columns[i] - 10, align: i ? 'right' : 'left' }); x += columns[i]; });
        doc.y = y + height + (heading ? 0 : 3);
      }
      header(); row(['Producto', 'Cant.', 'P. unit.', 'Importe'], true);
      for (const item of venta.items) row([item.producto, item.cantidad, dinero(item.precioCentavos), dinero(item.totalCentavos)]);
      if (doc.y + 130 > bottom()) { doc.addPage(); header(); }
      doc.y += 15;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#065f46').text('Total', 30, y);
      doc.text(dinero(venta.totalCentavos), 30, y, { width, align: 'right' });
      doc.y += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#475569').text('Método de pago: ' + venta.metodoPago, 30, doc.y);
      if (venta.recibidoCentavos !== null) {
        doc.text('Recibido: ' + dinero(venta.recibidoCentavos), 30, doc.y + 6);
        doc.text('Vuelto: ' + dinero(venta.vueltoCentavos), 30, doc.y + 6);
      }
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i); doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Comprobante interno - sin validez tributaria.', 30, doc.page.height - 31, { width, lineBreak: false });
        doc.text((i + 1) + '/' + pages.count, 30, doc.page.height - 20, { width, align: 'right', lineBreak: false });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { generarComprobante };
