const express = require('express');
const cors = require('cors');
const { reportesRouter } = require('./reportes');
const { ventasRouter } = require('./ventas');
const { reposicionesRouter } = require('./reposiciones');
const { randomBytes, createHash } = require('node:crypto');
const { openDatabase } = require('./database');
const { hashPassword, verifyPassword } = require('./password');
const digest = value => createHash('sha256').update(value).digest('hex');
const publicUser = u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre });
function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const origins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(v => v.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  app.get('/', async (req,res) => res.json({ mensaje: 'API de Nova Salud' }));
  app.get('/health', async (req,res) => { await db.get('SELECT 1'); res.json({ ok: true }); });
  app.post('/api/auth/login', async (req,res) => {
    const { usuario, password } = req.body || {};
    if (typeof usuario !== 'string' || !usuario.trim() || usuario.length > 80 || typeof password !== 'string' || !password || password.length > 128) return res.status(400).json({ error: 'Ingresa usuario y contraseña válidos' });
    const now = Date.now();
    const ip = digest(req.ip || 'unknown');
    const bloqueadoHasta = await db.withTransaction(async tx => {
      await tx.run('DELETE FROM intentos_login WHERE hasta <= ?', now);
      const intento = await tx.get('SELECT * FROM intentos_login WHERE ip = ?', ip);
      if (intento?.intentos >= 10) return intento.hasta;
      await tx.run('INSERT INTO intentos_login (ip, intentos, hasta) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET intentos = intentos + 1', ip, now + 15*60*1000);
      return null;
    });
    if (bloqueadoHasta) return res.status(429).set('Retry-After', String(Math.ceil((bloqueadoHasta-now)/1000))).json({ error: 'Demasiados intentos. Intenta en 15 minutos.' });
    const user = (await db.get('SELECT * FROM usuarios WHERE usuario = ?', usuario.trim()));
    if (!verifyPassword(password, user?.password || dummyHash) || !user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    await db.run('DELETE FROM intentos_login WHERE ip = ?', ip);
    await db.run('DELETE FROM sesiones WHERE expira <= ?', now);
    const token = randomBytes(32).toString('hex');
    await db.run('INSERT INTO sesiones VALUES (?, ?, ?)', digest(token), user.id, now + 8*60*60*1000);
    res.json({ token, usuario: publicUser(user) });
  });
  app.use('/api', async (req,res,next) => {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const user = token && (await db.get('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuarioId WHERE s.token = ? AND s.expira > ?', digest(token), Date.now()));
    if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    req.user = user; req.token = token; next();
  });
  app.use('/api/reportes', reportesRouter(db));
  app.get('/api/auth/me', async (req,res) => res.json(publicUser(req.user)));
  app.post('/api/auth/logout', async (req,res) => { (await db.run('DELETE FROM sesiones WHERE token = ?', digest(req.token))); res.sendStatus(204); });
  const productSelect = 'SELECT id, nombre, precioCentavos / 100.0 AS precio, stock, stockMinimo, (SELECT COALESCE(SUM(cantidad), 0) FROM ventas WHERE productoId = productos.id) AS vendidos FROM productos';
  const integer = (v, min=0) => Number.isSafeInteger(v) && v >= min && v <= 100000000;
  app.get('/api/productos', async (req,res) => res.json((await db.all(productSelect + ' ORDER BY id'))));
  app.post('/api/productos', async (req,res) => {
    const { nombre, precio, stock, stockMinimo } = req.body || {};
    const numeric = v => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' && Number.isFinite(Number(v));
    const cents = Math.round(Number(precio)*100);
    if (![precio,stock,stockMinimo].every(numeric) || typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 160 || !integer(cents,1) || Math.abs(Number(precio)*100-cents) > 0.00001 || !integer(Number(stock)) || stock === '' || stock == null || !integer(Number(stockMinimo)) || stockMinimo === '' || stockMinimo == null) return res.status(400).json({ error: 'Datos de producto inválidos: precio positivo, stock y mínimo enteros no negativos' });
    const result = (await db.run('INSERT INTO productos (nombre, precioCentavos, stock, stockMinimo) VALUES (?, ?, ?, ?)', nombre.trim(),cents,Number(stock),Number(stockMinimo)));
    res.status(201).json((await db.get(productSelect + ' WHERE id = ?', result.lastInsertRowid)));
  });
  app.use('/api', reposicionesRouter(db));
  app.use('/api/ventas', ventasRouter(db));
  app.get('/api/estadisticas', async (req,res) => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const total = (await db.get("SELECT COALESCE(SUM(totalCentavos),0) AS total FROM ventas WHERE date(fecha, '-5 hours') = ?", hoy)).total;
    res.json({ totalVentasHoy: (total/100).toFixed(2), cantidadProductos: (await db.get('SELECT COUNT(*) AS n FROM productos')).n, alertasCriticas: (await db.get('SELECT COUNT(*) AS n FROM productos WHERE stock <= stockMinimo')).n, masVendido: (await db.get('SELECT producto FROM ventas GROUP BY productoId ORDER BY SUM(cantidad) DESC, productoId LIMIT 1'))?.producto || 'Ninguno aún' });
  });
  app.use(async (req,res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((err,req,res,next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Solicitud inválida' });
    console.error(err); res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}
async function start() {
  const db = await openDatabase();
  const server = createApp(db).listen(process.env.PORT || 3001, '0.0.0.0', () => console.log('API Nova Salud iniciada'));
  const shutdown = () => server.close(async () => { await db.close(); process.exit(0); });
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
if (require.main === module) start().catch(() => { console.error('No se pudo iniciar la API. Revisa la configuración y disponibilidad de la base de datos.'); process.exitCode = 1; });
module.exports = { createApp };
