const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs');
const { rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase } = require('./database');
const { createApp } = require('./server');
const { registrarCompra } = require('./ventas');

async function fixture() {
  const db = await openDatabase(':memory:');
  await db.run('INSERT INTO usuarios (id, usuario, nombre, password) VALUES (1, ?, ?, ?)', 'caja', 'María Torres', 'fixture');
  await db.run('INSERT INTO productos (id,nombre,precioCentavos,stock,stockMinimo) VALUES (1,?,150,10,2)', 'Paracetamol 500 mg');
  await db.run('INSERT INTO productos (id,nombre,precioCentavos,stock,stockMinimo) VALUES (2,?,650,5,2)', 'Alcohol 70% - 250 ml');
  return db;
}
const user = { id: 1, nombre: 'María Torres' };
const compra = () => ({ items: [{ productoId: 1, cantidad: 2, precioCentavos: 150 }, { productoId: 2, cantidad: 1, precioCentavos: 650 }], metodoPago: 'Efectivo', recibidoCentavos: 1000, clave: randomUUID() });

test('carrito completo, pago, comprobante, reportes y reintentos sin duplicar', async () => {
  const db = await fixture();
  const token = randomBytes(32).toString('hex');
  await db.run('INSERT INTO sesiones VALUES (?, 1, ?)', createHash('sha256').update(token).digest('hex'), Date.now() + 60000);
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const base = 'http://127.0.0.1:'+server.address().port+'/api';
  const call = async (path, body) => {
    const r = await fetch(base+path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer '+token, 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  try {
    const hoy = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
    await db.run('INSERT INTO ventas (fecha,productoId,producto,cantidad,totalCentavos,usuarioId,vendedor) VALUES (?,1,?,1,150,1,?)', new Date().toISOString(), 'Paracetamol 500 mg', user.nombre);
    const body = compra();
    const first = await call('/ventas', { ...body, vendedor:'Falso', totalCentavos:1 });
    assert.equal(first.status,200); assert.equal(first.body.venta.totalCentavos,950);
    assert.equal(first.body.venta.vueltoCentavos,50); assert.equal(first.body.venta.vendedor,user.nombre);
    assert.equal(first.body.venta.items.length,2); assert.equal(first.body.venta.cantidad,3);
    const repeated = await call('/ventas', body);
    assert.equal(repeated.status,200); assert.equal(repeated.body.repetida,true);
    assert.equal(repeated.body.venta.id,first.body.venta.id);
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,8);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM cobros')).n,1);
    assert.equal((await call('/ventas', { ...body, recibidoCentavos:2000 })).status,409);
    assert.equal((await call('/ventas', { ...compra(), recibidoCentavos:100 })).status,400);
    assert.equal((await call('/ventas', { ...compra(), metodoPago:'Desconocido' })).status,400);
    assert.equal((await call('/ventas', { ...compra(), items:[] })).status,400);
    assert.equal((await call('/ventas', { ...compra(), items:[{productoId:1,cantidad:1.5,precioCentavos:150}] })).status,400);
    assert.equal((await call('/ventas', { ...compra(), items:[{productoId:1,cantidad:1,precioCentavos:150},{productoId:1,cantidad:1,precioCentavos:150}] })).status,400);
    assert.equal((await call('/ventas', { ...compra(), items:[{productoId:1,cantidad:1,precioCentavos:100}] })).status,409);
    assert.equal((await call('/ventas', { ...compra(), items:[{productoId:999,cantidad:1,precioCentavos:150}] })).status,404);
    const history = (await call('/ventas')).body;
    assert.equal(history.length,2); assert.ok(history.some(v=>v.id.startsWith('h-')));
    const report = (await call('/reportes?desde='+hoy+'&hasta='+hoy)).body;
    assert.equal(report.ventas.totalCentavos,1100); assert.equal(report.ventas.cantidadVentas,2);
    assert.equal(report.ventas.unidadesVendidas,4); assert.equal(report.ventas.ticketPromedioCentavos,550);
    assert.equal(report.porDia[0].cantidadVentas,2); assert.equal(report.vendedores[0].cantidadVentas,2);
    const pdf = await fetch(base+'/ventas/'+first.body.venta.id+'/comprobante',{headers:{Authorization:'Bearer '+token}});
    assert.equal(pdf.status,200); assert.equal(pdf.headers.get('content-type'),'application/pdf');
    const buffer = Buffer.from(await pdf.arrayBuffer()); assert.equal(buffer.subarray(0,5).toString(),'%PDF-');
    if (process.env.NOVA_TEST_PDF_OUTPUT_DIR) { mkdirSync(process.env.NOVA_TEST_PDF_OUTPUT_DIR,{recursive:true}); writeFileSync(join(process.env.NOVA_TEST_PDF_OUTPUT_DIR,'comprobante-caja.pdf'),buffer); }
    assert.equal((await fetch(base+'/ventas/'+first.body.venta.id+'/comprobante')).status,401);
    assert.equal((await call('/ventas/v-999/comprobante')).status,404);
    for (const metodoPago of ['Yape / Plin','Tarjeta']) {
      const r = await call('/ventas',{ ...compra(),metodoPago,recibidoCentavos:null });
      assert.equal(r.status,200); assert.equal(r.body.venta.vueltoCentavos,null);
    }
  } finally { await new Promise(resolve=>server.close(resolve)); await db.close(); }
});

test('envíos simultáneos no duplican el cobro y dos cajas no venden el mismo stock', async () => {
  const db = await fixture();
  try {
    const payload=compra();
    const results=await Promise.all([registrarCompra(db,payload,user),registrarCompra(db,payload,user)]);
    assert.equal(results[0].venta.id,results[1].venta.id);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM cobros')).n,1);
    await db.run('UPDATE productos SET stock = 2 WHERE id = 1');
    const make = () => ({items:[{productoId:1,cantidad:2,precioCentavos:150}],metodoPago:'Tarjeta',clave:randomUUID()});
    const competing=await Promise.allSettled([registrarCompra(db,make(),user),registrarCompra(db,make(),user)]);
    assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(competing.find(r=>r.status==='rejected').reason.status,409);
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,0);
  } finally { await db.close(); }
});

test('falta de stock o fallo de escritura revierte todo el carrito', async () => {
  const db = await fixture();
  try {
    await db.run('UPDATE productos SET stock = 0 WHERE id = 2');
    await assert.rejects(registrarCompra(db,compra(),user),{status:409});
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,10);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM cobros')).n,0);
    await db.run('UPDATE productos SET stock = 5 WHERE id = 2');
    await db.run("CREATE TRIGGER romper_linea BEFORE INSERT ON ventas WHEN NEW.productoId = 2 BEGIN SELECT RAISE(ABORT, 'fallo'); END");
    await assert.rejects(registrarCompra(db,compra(),user));
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,10);
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 2')).stock,5);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas')).n,0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM cobros')).n,0);
  } finally { await db.close(); }
});

test('migración de la base previa conserva ventas y stock, y los reintentos sobreviven a reinicios', async () => {
  const dir=mkdtempSync(join(tmpdir(),'nova-migracion-'));
  const file=join(dir,'old.sqlite');
  let db;
  try {
    const old=new DatabaseSync(file);
    old.exec("CREATE TABLE usuarios (id INTEGER PRIMARY KEY,usuario TEXT UNIQUE,nombre TEXT,password TEXT); CREATE TABLE productos (id INTEGER PRIMARY KEY,nombre TEXT,precioCentavos INTEGER,stock INTEGER,stockMinimo INTEGER); CREATE TABLE ventas (id INTEGER PRIMARY KEY,fecha TEXT,productoId INTEGER,producto TEXT,cantidad INTEGER,totalCentavos INTEGER,usuarioId INTEGER,vendedor TEXT); INSERT INTO usuarios VALUES (1,'caja','María Torres','hash'); INSERT INTO productos VALUES (1,'Producto histórico',150,20,2); INSERT INTO ventas VALUES (1,'2026-01-01T12:00:00.000Z',1,'Producto histórico',2,300,1,'María Torres');");
    old.close();
    db=await openDatabase(file);
    assert.equal((await db.get('SELECT cobroId FROM ventas WHERE id = 1')).cobroId,null);
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,20);
    const body={items:[{productoId:1,cantidad:1,precioCentavos:150}],metodoPago:'Tarjeta',clave:randomUUID()};
    const first=await registrarCompra(db,body,user);
    await db.close(); db=await openDatabase(file);
    const repeat=await registrarCompra(db,body,user);
    assert.equal(first.venta.id,repeat.venta.id); assert.equal(repeat.repetida,true);
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock,19);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas')).n,2);
    assert.equal((await db.get('SELECT totalCentavos FROM ventas WHERE id = 1')).totalCentavos,300);
  } finally { if(db)await db.close(); await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
});
