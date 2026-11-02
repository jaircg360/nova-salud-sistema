const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { openDatabase } = require('./database');
const { createApp } = require('./server');
const { hashPassword } = require('./password');
const { validarPeriodo } = require('./reportes');

test('valida fechas reales, rangos y parámetros repetidos', () => {
  assert.equal(validarPeriodo({ desde: '2024-02-29', hasta: '2024-02-29' }).inicioUTC, '2024-02-29T05:00:00.000Z');
  for (const query of [
    { desde: '2026-02-29', hasta: '2026-03-01' }, { desde: '2026-04-31', hasta: '2026-05-01' },
    { desde: '2026-10-02', hasta: '2026-10-01' }, { desde: '2024-01-01', hasta: '2026-01-01' },
    { desde: ['2026-01-01'], hasta: '2026-01-02' }, { desde: 'bad', hasta: '2026-01-01' },
  ]) assert.throws(() => validarPeriodo(query), { status: 400 });
});

test('reportes autenticados: límites de Lima, totales, inventario y PDF multipágina', async () => {
  const db = await openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  let token;
  const request = path => fetch(base + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const save = (name, buffer) => {
    if (process.env.NOVA_TEST_PDF_OUTPUT_DIR) {
      mkdirSync(process.env.NOVA_TEST_PDF_OUTPUT_DIR, { recursive: true });
      writeFileSync(join(process.env.NOVA_TEST_PDF_OUTPUT_DIR, name), buffer);
    }
  };
  try {
    assert.equal((await request('/reportes')).status, 401);
    assert.equal((await request('/reportes/pdf')).status, 401);
    await db.run('INSERT INTO usuarios (id, usuario, nombre, password) VALUES (?, ?, ?, ?)', 1, 'reportes', 'María Torres', hashPassword('report-test-123'));
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'reportes', password: 'report-test-123' }) });
    assert.equal(login.status, 200); token = (await login.json()).token;
    const period = '?desde=2026-10-01&hasta=2026-10-01';
    let response = await request('/reportes' + period);
    let data = await response.json();
    assert.equal(data.ventas.totalCentavos, 0);
    assert.equal(data.ventas.ticketPromedioCentavos, 0);
    assert.deepEqual(data.porDia, []);
    response = await request('/reportes/pdf' + period);
    const emptyPDF = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert.equal(emptyPDF.subarray(0, 5).toString(), '%PDF-'); save('reporte-vacio.pdf', emptyPDF);
    await db.run('INSERT INTO productos (id, nombre, precioCentavos, stock, stockMinimo) VALUES (1, ?, 150, 3, 5)', 'Paracetamol 500 mg');
    await db.run('INSERT INTO productos (id, nombre, precioCentavos, stock, stockMinimo) VALUES (2, ?, 200, 0, 4)', 'Ibuprofeno 400 mg');
    await db.run('INSERT INTO productos (id, nombre, precioCentavos, stock, stockMinimo) VALUES (3, ?, 350, 10, 3)', 'Amoxicilina 500 mg');
    const saleSQL = 'INSERT INTO ventas (fecha, productoId, producto, cantidad, totalCentavos, usuarioId, vendedor) VALUES (?, 1, ?, ?, ?, 1, ?)';
    await db.run(saleSQL, '2026-10-01T04:59:59.999Z', 'Paracetamol 500 mg', 100, 15000, 'María Torres');
    await db.run(saleSQL, '2026-10-01T05:00:00.000Z', 'Paracetamol 500 mg', 2, 300, 'María Torres');
    await db.run(saleSQL, '2026-10-02T04:59:59.999Z', 'Paracetamol 500 mg', 3, 600, 'María Torres');
    await db.run(saleSQL, '2026-10-02T05:00:00.000Z', 'Paracetamol 500 mg', 100, 15000, 'María Torres');
    response = await request('/reportes' + period); data = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(data.ventas, { totalCentavos: 900, cantidadVentas: 2, unidadesVendidas: 5, ticketPromedioCentavos: 450 });
    assert.equal(data.porDia.length, 1); assert.equal(data.porDia[0].fecha, '2026-10-01');
    assert.equal(data.porDia[0].totalCentavos, 900);
    assert.equal(data.productosMasVendidos[0].unidades, 5);
    assert.equal(data.vendedores[0].nombre, 'María Torres'); assert.equal(data.vendedores[0].totalCentavos, 900);
    assert.deepEqual(data.inventario.resumen, { productos: 3, unidades: 13, agotados: 1, stockBajo: 1, valorVentaCentavos: 3950 });
    assert.equal(data.inventario.productos.find(p => p.id === 1).reponer, 2);
    assert.equal(data.inventario.productos.find(p => p.id === 2).estado, 'Agotado');
    assert.equal((await request('/reportes?desde=2026-02-30&hasta=2026-03-01')).status, 400);
    assert.equal((await request('/reportes/pdf?desde=invalid')).status, 400);
    response = await request('/reportes/pdf' + period);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /attachment;.*2026-10-01/);
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); save('reporte-ejemplo.pdf', pdf);
    await db.withTransaction(async tx => {
      for (let i = 4; i <= 123; i++) await tx.run('INSERT INTO productos (nombre, precioCentavos, stock, stockMinimo) VALUES (?, ?, ?, ?)', 'Medicamento de nombre extenso para verificar el ajuste de líneas en el reporte de inventario - Presentación número ' + i, 300, i, 10);
    });
    response = await request('/reportes/pdf' + period);
    assert.equal(response.status, 200);
    const longPDF = Buffer.from(await response.arrayBuffer());
    assert.ok(longPDF.length > pdf.length); save('reporte-largo.pdf', longPDF);
    assert.equal((await request('/auth/me')).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve)); await db.close();
  }
});
