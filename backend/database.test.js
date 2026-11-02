const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('./database');

test('revierte una transacción fallida y permite seguir usando la base', async () => {
  const db = await openDatabase(':memory:');
  try {
    await db.run('INSERT INTO productos (nombre, precioCentavos, stock, stockMinimo) VALUES (?, ?, ?, ?)', 'Prueba', 150, 5, 1);
    await assert.rejects(db.withTransaction(async tx => {
      await tx.run('UPDATE productos SET stock = stock - 2 WHERE id = 1');
      // A failed sale insert must also undo the preceding stock decrement.
      await tx.run('INSERT INTO ventas (fecha) VALUES (?)', new Date().toISOString());
    }));
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock, 5);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ventas')).n, 0);
    await db.withTransaction(tx => tx.run('UPDATE productos SET stock = stock + 1 WHERE id = 1'));
    assert.equal((await db.get('SELECT stock FROM productos WHERE id = 1')).stock, 6);
    await assert.rejects(db.run('INSERT INTO sesiones VALUES (?, ?, ?)', 'invalid-user', 999, Date.now()));
  } finally { await db.close(); }
});

test('rechaza configuraciones incompletas de Turso y evita fallback local en producción', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN };
  try {
    delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    process.env.NODE_ENV = 'production';
    await assert.rejects(openDatabase(), /Configura Turso/);
    process.env.TURSO_AUTH_TOKEN = 'not-a-real-token';
    await assert.rejects(openDatabase(), /Falta TURSO_DATABASE_URL/);
    process.env.TURSO_DATABASE_URL = 'libsql://test.turso.io';
    delete process.env.TURSO_AUTH_TOKEN;
    await assert.rejects(openDatabase(), /Falta TURSO_AUTH_TOKEN/);
    process.env.TURSO_DATABASE_URL = 'file:local.sqlite';
    await assert.rejects(openDatabase(), /debe usar/);
  } finally {
    for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
