const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('./database');
const { seedDemo } = require('./seed-demo');
test('demo coherente, repetible y sin modificar los datos existentes', async () => {
  const db = await openDatabase(':memory:');
  const now = new Date('2026-11-02T18:00:00.000Z');
  try {
    await db.run('INSERT INTO usuarios (usuario,nombre,password) VALUES (?,?,?)','original','Usuario real','hash-original');
    await db.run('INSERT INTO productos (nombre,precioCentavos,stock,stockMinimo) VALUES (?,?,?,?)','Producto real',250,7,2);
    const result = await seedDemo(db,now);
    assert.equal(result.productos,30); assert.equal(result.ventas,240); assert.equal(result.vendedores,3); assert.equal(result.yaExistia,false);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM productos')).n,31);
    assert.equal((await db.get('SELECT stock FROM productos WHERE nombre = ?','Producto real')).stock,7);
    assert.equal((await db.get('SELECT password FROM usuarios WHERE usuario = ?','original')).password,'hash-original');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM usuarios')).n,4);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas WHERE totalCentavos != cantidad * (SELECT precioCentavos FROM productos WHERE id = productoId)')).n,0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM productos WHERE stock < 0')).n,0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM productos WHERE stock = 0')).n,5);
    assert.ok((await db.get('SELECT COUNT(*) AS n FROM productos WHERE stock > 0 AND stock < stockMinimo')).n > 0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas WHERE fecha > ?',now.toISOString())).n,0);
    assert.equal((await db.get("SELECT COUNT(DISTINCT date(fecha, '-5 hours')) AS n FROM ventas")).n,60);
    assert.equal((await seedDemo(db,new Date('2026-11-03T18:00:00.000Z'))).yaExistia,true);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas')).n,240);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM productos')).n,31);
  } finally { await db.close(); }
});
test('un fallo en el lote revierte productos, vendedores y marca de carga', async () => {
  const db = await openDatabase(':memory:');
  try {
    await db.run("CREATE TRIGGER fallar_demo BEFORE INSERT ON ventas BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END");
    await assert.rejects(seedDemo(db));
    for (const table of ['productos','ventas','usuarios','demo_cargas']) assert.equal((await db.get('SELECT COUNT(*) AS n FROM '+table)).n,0);
  } finally { await db.close(); }
});
