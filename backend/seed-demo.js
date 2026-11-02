const { randomBytes } = require('node:crypto');
const { openDatabase } = require('./database');
const { hashPassword } = require('./password');

const CARGA = 'nova-salud-demo-v1';
const productosBase = [
  ['Paracetamol 500 mg', 150], ['Ibuprofeno 400 mg', 200], ['Amoxicilina 500 mg', 350],
  ['Loratadina 10 mg', 180], ['Cetirizina 10 mg', 200], ['Omeprazol 20 mg', 250],
  ['Naproxeno 550 mg', 280], ['Diclofenaco gel 1% - 50 g', 1850], ['Alcohol 70% - 250 ml', 650],
  ['Agua oxigenada - 120 ml', 450], ['Suero fisiológico - 500 ml', 800], ['Sales de rehidratación - sobre', 350],
  ['Vitamina C 1 g - efervescente', 250], ['Multivitamínico - 30 tabletas', 3200], ['Zinc 20 mg - 30 tabletas', 2400],
  ['Termómetro digital', 1800], ['Mascarillas - caja de 50', 1500], ['Guantes de nitrilo - caja de 100', 3500],
  ['Gasas estériles - paquete', 400], ['Venda elástica - 10 cm', 750], ['Esparadrapo - rollo', 550],
  ['Curitas - caja de 20', 600], ['Jeringa descartable - 5 ml', 150], ['Algodón - 100 g', 650],
  ['Protector solar SPF 50 - 100 ml', 4500], ['Crema hidratante - 200 ml', 2800], ['Jabón líquido - 250 ml', 1200],
  ['Pañales de adulto - paquete', 3800], ['Toallitas húmedas - paquete', 850], ['Gel antibacterial - 250 ml', 950],
];

async function seedDemo(db, now = new Date()) {
  await db.run('CREATE TABLE IF NOT EXISTS demo_cargas (nombre TEXT PRIMARY KEY, fecha TEXT NOT NULL, resumen TEXT NOT NULL)');
  const previous = await db.get('SELECT resumen FROM demo_cargas WHERE nombre = ?', CARGA);
  if (previous) return { ...JSON.parse(previous.resumen), yaExistia: true };

  const nombres = productosBase.map(([nombre]) => '[DEMO] ' + nombre);
  const vendedores = [
    { usuario: '__demo_nova_maria', nombre: 'María Torres (demo)' },
    { usuario: '__demo_nova_carlos', nombre: 'Carlos Ramírez (demo)' },
    { usuario: '__demo_nova_lucia', nombre: 'Lucía Flores (demo)' },
  ];
  // Avoid associating simulated sales with pre-existing accounts or products.
  const existentes = await db.all('SELECT nombre FROM productos WHERE nombre IN (' + nombres.map(() => '?').join(',') + ')', ...nombres);
  const usuariosExistentes = await db.all('SELECT usuario FROM usuarios WHERE usuario IN (?, ?, ?)', ...vendedores.map(v => v.usuario));
  if (existentes.length || usuariosExistentes.length) throw new Error('Hay registros demo previos sin marca de carga. No se modificó ninguno; revisa antes de volver a cargar.');

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now);
  const midnight = Date.parse(hoy + 'T05:00:00.000Z');
  const ventas = [];
  for (let day = 59; day >= 0; day--) {
    for (let sale = 0; sale < 4; sale++) {
      const producto = sale === 3 ? 12 + day % 18 : (day + sale * 4) % 12;
      const cantidad = 1 + (day * 3 + sale) % 4;
      const scheduled = midnight - day * 86400000 + (8 + sale * 3) * 3600000 + ((day * 7 + sale * 11) % 60) * 60000;
      // Today's generated sales must never have a future timestamp.
      const timestamp = Math.min(scheduled, now.getTime() - (4 - sale) * 1000);
      ventas.push({ producto, cantidad, total: productosBase[producto][1] * cantidad, vendedor: (day + sale) % 3, fecha: new Date(timestamp).toISOString() });
    }
  }
  const vendidos = productosBase.map((_, i) => ventas.filter(v => v.producto === i).reduce((n, v) => n + v.cantidad, 0));
  const productos = productosBase.map(([nombre, precio], i) => {
    const minimo = 10 + (i % 3) * 5;
    const final = i % 7 === 0 ? 0 : i % 5 === 0 ? Math.max(1, minimo - 4) : 40 + i * 3;
    return { nombre: nombres[i], precio, minimo, final, inicial: final + vendidos[i] };
  });
  const resumen = { productos: productos.length, vendedores: vendedores.length, ventas: ventas.length, desde: ventas[0].fecha, hasta: ventas.at(-1).fecha, totalCentavos: ventas.reduce((n,v) => n + v.total, 0) };
  const statements = [{ sql: 'INSERT INTO demo_cargas (nombre, fecha, resumen) VALUES (?, ?, ?)', args: [CARGA, now.toISOString(), JSON.stringify(resumen)] }];
  for (const v of vendedores) statements.push({ sql: 'INSERT INTO usuarios (usuario, nombre, password) VALUES (?, ?, ?)', args: [v.usuario, v.nombre, hashPassword(randomBytes(32).toString('hex'))] });
  for (const p of productos) statements.push({ sql: 'INSERT INTO productos (nombre, precioCentavos, stock, stockMinimo) VALUES (?, ?, ?, ?)', args: [p.nombre, p.precio, p.inicial, p.minimo] });
  for (const v of ventas) {
    const p = productos[v.producto], seller = vendedores[v.vendedor];
    statements.push({ sql: 'INSERT INTO ventas (fecha, productoId, producto, cantidad, totalCentavos, usuarioId, vendedor) VALUES (?, (SELECT id FROM productos WHERE nombre = ?), ?, ?, ?, (SELECT id FROM usuarios WHERE usuario = ?), ?)', args: [v.fecha, p.nombre, p.nombre, v.cantidad, v.total, seller.usuario, seller.nombre] });
    statements.push({ sql: 'UPDATE productos SET stock = stock - ? WHERE nombre = ?', args: [v.cantidad, p.nombre] });
  }
  // One atomic batch avoids timeouts from hundreds of network round trips to Turso.
  // A duplicated load marker also aborts the batch if two loads run concurrently.
  await db.batch(statements);
  return { ...resumen, yaExistia: false };
}

async function main() {
  const db = await openDatabase();
  try {
    const result = await seedDemo(db);
    console.log(result.yaExistia ? 'La carga demo ya existe; no se insertaron duplicados.' : 'Datos demo cargados correctamente.');
    console.log(JSON.stringify(result, null, 2));
    console.log('Los vendedores demo no tienen contraseña de acceso publicada. Usa tu cuenta habitual.');
  } finally { await db.close(); }
}
if (require.main === module) main().catch(error => {
  console.error('No se pudo cargar la demo: ' + (error.message.startsWith('Hay registros demo') ? error.message : 'revisa la conexión y los permisos. Ninguna carga parcial se conserva.'));
  process.exitCode = 1;
});
module.exports = { seedDemo };
