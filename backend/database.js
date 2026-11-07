const { createClient } = require('@libsql/client');
const { mkdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const schema = [
  "CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE, nombre TEXT NOT NULL, password TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuarioId INTEGER NOT NULL REFERENCES usuarios(id), expira INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS intentos_login (ip TEXT PRIMARY KEY, intentos INTEGER NOT NULL, hasta INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precioCentavos INTEGER NOT NULL CHECK(precioCentavos > 0), stock INTEGER NOT NULL CHECK(stock >= 0), stockMinimo INTEGER NOT NULL CHECK(stockMinimo >= 0))",
  "CREATE TABLE IF NOT EXISTS reposiciones (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, fechaRecepcion TEXT NOT NULL, productoId INTEGER NOT NULL REFERENCES productos(id), producto TEXT NOT NULL, cantidad INTEGER NOT NULL CHECK(cantidad > 0), stockAnterior INTEGER NOT NULL CHECK(stockAnterior >= 0), stockPosterior INTEGER NOT NULL CHECK(stockPosterior = stockAnterior + cantidad), proveedor TEXT NOT NULL CHECK(length(trim(proveedor)) > 0), documento TEXT NOT NULL, costoUnitarioCentavos INTEGER CHECK(costoUnitarioCentavos >= 0), observaciones TEXT NOT NULL, usuarioId INTEGER NOT NULL REFERENCES usuarios(id), usuario TEXT NOT NULL, clave TEXT NOT NULL, huella TEXT NOT NULL, UNIQUE(usuarioId,clave))",
  "CREATE TABLE IF NOT EXISTS ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, productoId INTEGER NOT NULL REFERENCES productos(id), producto TEXT NOT NULL, cantidad INTEGER NOT NULL CHECK(cantidad > 0), totalCentavos INTEGER NOT NULL CHECK(totalCentavos > 0), usuarioId INTEGER NOT NULL REFERENCES usuarios(id), vendedor TEXT NOT NULL)"
];

// Both local SQLite and Turso use the same asynchronous SQL API.
function queries(executor, schedule = task => task()) {
  const execute = (sql, args) => schedule(() => executor.execute({ sql, args }));
  return {
    run: (sql, ...args) => execute(sql, args),
    get: async (sql, ...args) => (await execute(sql, args)).rows[0],
    all: async (sql, ...args) => (await execute(sql, args)).rows,
    batch: statements => schedule(() => executor.batch(statements)),
  };
}

async function openDatabase(filename) {
  const remote = filename === undefined && Boolean(process.env.TURSO_DATABASE_URL);
  if (filename === undefined && !remote && process.env.TURSO_AUTH_TOKEN) throw new Error('Falta TURSO_DATABASE_URL');
  if (remote && (!process.env.TURSO_DATABASE_URL.startsWith('libsql://') && !process.env.TURSO_DATABASE_URL.startsWith('https://'))) throw new Error('TURSO_DATABASE_URL debe usar libsql:// o https://');
  if (remote && !process.env.TURSO_AUTH_TOKEN) throw new Error('Falta TURSO_AUTH_TOKEN');
  if (!remote && filename === undefined && process.env.NODE_ENV === 'production') throw new Error('Configura Turso: SQLite local no conserva datos en Render Free');
  const localPath = filename || process.env.DATABASE_PATH || resolve(__dirname,'data/nova.sqlite');
  if (!remote && localPath !== ':memory:') mkdirSync(dirname(resolve(localPath)), { recursive: true });
  const client = createClient({
    url: remote ? process.env.TURSO_DATABASE_URL : localPath === ':memory:' ? 'file::memory:' : pathToFileURL(resolve(localPath)).href,
    authToken: remote ? process.env.TURSO_AUTH_TOKEN : undefined,
    intMode: 'number',
  });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    await client.batch([...schema, 'CREATE INDEX IF NOT EXISTS ventas_fecha_idx ON ventas(fecha)', 'CREATE INDEX IF NOT EXISTS ventas_producto_idx ON ventas(productoId)'], 'write');
    // Add the checkout header and an optional link. Historical lines stay untouched.
    const migration = await client.transaction('write');
    try {
      await migration.execute("CREATE TABLE IF NOT EXISTS cobros (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, usuarioId INTEGER NOT NULL REFERENCES usuarios(id), vendedor TEXT NOT NULL, metodoPago TEXT NOT NULL CHECK(metodoPago IN ('Efectivo', 'Yape / Plin', 'Tarjeta', 'Sin registrar')), totalCentavos INTEGER NOT NULL CHECK(totalCentavos > 0), recibidoCentavos INTEGER, vueltoCentavos INTEGER, clave TEXT NOT NULL, huella TEXT NOT NULL, UNIQUE(usuarioId, clave))");
      const columns = await migration.execute('PRAGMA table_info(ventas)');
      if (!columns.rows.some(column => column.name === 'cobroId')) await migration.execute('ALTER TABLE ventas ADD COLUMN cobroId INTEGER REFERENCES cobros(id)');
      await migration.execute('CREATE INDEX IF NOT EXISTS ventas_cobro_idx ON ventas(cobroId)');
      await migration.commit();
    } catch (error) { if (!migration.closed) await migration.rollback(); throw error; }
    finally { migration.close(); }
  } catch (error) { client.close(); throw error; }

  // Serialize this client's operations so local requests cannot interleave with a write transaction.
  let pending = Promise.resolve();
  const schedule = task => {
    const result = pending.then(task);
    pending = result.catch(() => {});
    return result;
  };
  return {
    ...queries(client, schedule),
    batch: statements => schedule(() => client.batch(statements, 'write')),
    withTransaction: (callback, mode = 'write') => schedule(async () => {
      const tx = await client.transaction(mode);
      try {
        const result = await callback(queries(tx));
        await tx.commit();
        return result;
      } catch (error) {
        if (!tx.closed) await tx.rollback();
        throw error;
      } finally { tx.close(); }
    }),
    close: () => schedule(() => client.close()),
  };
}
module.exports = { openDatabase };
