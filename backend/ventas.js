const express = require('express');
const { createHash, randomUUID } = require('node:crypto');
const { generarComprobante } = require('./comprobante-pdf');

const METODOS = ['Efectivo', 'Yape / Plin', 'Tarjeta'];
const integer = (v, min = 0, max = 100000000) => Number.isSafeInteger(v) && v >= min && v <= max;
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, extra });
const headerColumns = 'id, fecha, usuarioId, vendedor, metodoPago, totalCentavos, recibidoCentavos, vueltoCentavos';

function presentarVenta(header, items, legacy = false) {
  const id = (legacy ? 'h-' : 'v-') + header.id;
  return {
    id, numero: (legacy ? 'H-' : 'V-') + String(header.id).padStart(6, '0'),
    fecha: header.fecha, vendedor: header.vendedor, metodoPago: header.metodoPago || 'Sin registrar',
    totalCentavos: header.totalCentavos, total: (header.totalCentavos / 100).toFixed(2),
    recibidoCentavos: header.recibidoCentavos ?? null, vueltoCentavos: header.vueltoCentavos ?? null,
    cantidad: items.reduce((n, item) => n + item.cantidad, 0),
    producto: items.length === 1 ? items[0].producto : items.length + ' productos',
    items: items.map(item => ({ productoId: item.productoId, producto: item.producto, cantidad: item.cantidad, precioCentavos: Math.round(item.totalCentavos / item.cantidad), totalCentavos: item.totalCentavos })),
  };
}

async function obtenerVenta(tx, id) {
  const match = /^(v|h)-([1-9]\d{0,12})$/.exec(id);
  if (!match) throw fail(404, 'Venta no encontrada');
  const legacy = match[1] === 'h';
  const number = Number(match[2]);
  const header = await tx.get(legacy ? 'SELECT * FROM ventas WHERE id = ? AND cobroId IS NULL' : 'SELECT ' + headerColumns + ' FROM cobros WHERE id = ?', number);
  if (!header) throw fail(404, 'Venta no encontrada');
  const items = legacy ? [header] : await tx.all('SELECT productoId, producto, cantidad, totalCentavos FROM ventas WHERE cobroId = ? ORDER BY id', number);
  return presentarVenta(header, items, legacy);
}

function validarCompra(body) {
  const legacy = body && !Object.hasOwn(body, 'items');
  const input = legacy ? [{ productoId: body.productoId, cantidad: body.cantidad }] : body?.items;
  if (!Array.isArray(input) || !input.length || input.length > 50) throw fail(400, 'Agrega entre 1 y 50 productos a la venta');
  const ids = new Set();
  const items = input.map(item => {
    if (!item || !integer(item.productoId, 1) || !integer(item.cantidad, 1) || (!legacy && !integer(item.precioCentavos, 1))) throw fail(400, 'Producto, cantidad y precio deben ser enteros positivos');
    if (ids.has(item.productoId)) throw fail(400, 'El mismo producto no puede aparecer dos veces; ajusta su cantidad');
    ids.add(item.productoId);
    return { productoId: item.productoId, cantidad: item.cantidad, precioCentavos: legacy ? null : item.precioCentavos };
  }).sort((a, b) => a.productoId - b.productoId);
  const metodoPago = legacy ? 'Sin registrar' : body.metodoPago;
  if (!legacy && !METODOS.includes(metodoPago)) throw fail(400, 'Selecciona un método de pago válido');
  const recibidoCentavos = metodoPago === 'Efectivo' ? body.recibidoCentavos : null;
  if (metodoPago === 'Efectivo' && !integer(recibidoCentavos, 1, 1000000000)) throw fail(400, 'Ingresa un monto recibido válido');
  const clave = legacy ? randomUUID() : body.clave;
  if (typeof clave !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(clave)) throw fail(400, 'Falta el identificador de la venta; vuelve a intentar desde caja');
  const huella = createHash('sha256').update(JSON.stringify({ items, metodoPago, recibidoCentavos })).digest('hex');
  return { items, metodoPago, recibidoCentavos, clave, huella };
}

async function registrarCompra(db, body, user) {
  const compra = validarCompra(body);
  return db.withTransaction(async tx => {
    const prior = await tx.get('SELECT id, huella FROM cobros WHERE usuarioId = ? AND clave = ?', user.id, compra.clave);
    if (prior) {
      if (prior.huella !== compra.huella) throw fail(409, 'Este identificador ya corresponde a otra compra');
      return { venta: await obtenerVenta(tx, 'v-' + prior.id), alerta: null, repetida: true };
    }
    const productos = await tx.all('SELECT * FROM productos WHERE id IN (' + compra.items.map(() => '?').join(',') + ')', ...compra.items.map(item => item.productoId));
    const items = compra.items.map(item => {
      const p = productos.find(p => p.id === item.productoId);
      if (!p) throw fail(404, 'Uno de los productos ya no está disponible', { productoId: item.productoId });
      if (p.stock < item.cantidad) throw fail(409, 'Stock insuficiente de ' + p.nombre + '. Disponible: ' + p.stock, { productoId: p.id });
      if (item.precioCentavos !== null && item.precioCentavos !== p.precioCentavos) throw fail(409, 'Cambió el precio de ' + p.nombre + '. Actualiza los precios del carrito y revisa el total.', { productoId: p.id, precioCambio: true });
      return { productoId: p.id, producto: p.nombre, cantidad: item.cantidad, totalCentavos: p.precioCentavos * item.cantidad, stockFinal: p.stock - item.cantidad, stockMinimo: p.stockMinimo };
    });
    const totalCentavos = items.reduce((n, item) => n + item.totalCentavos, 0);
    if (!integer(totalCentavos, 1, 1000000000)) throw fail(400, 'El importe de la venta está fuera del rango permitido');
    if (compra.metodoPago === 'Efectivo' && compra.recibidoCentavos < totalCentavos) throw fail(400, 'El efectivo recibido no cubre el total');
    const header = {
      fecha: new Date().toISOString(), vendedor: user.nombre, metodoPago: compra.metodoPago, totalCentavos,
      recibidoCentavos: compra.recibidoCentavos, vueltoCentavos: compra.recibidoCentavos === null ? null : compra.recibidoCentavos - totalCentavos,
    };
    const inserted = await tx.run('INSERT INTO cobros (fecha, usuarioId, vendedor, metodoPago, totalCentavos, recibidoCentavos, vueltoCentavos, clave, huella) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', header.fecha, user.id, header.vendedor, header.metodoPago, totalCentavos, header.recibidoCentavos, header.vueltoCentavos, compra.clave, compra.huella);
    header.id = Number(inserted.lastInsertRowid);
    const statements = [];
    for (const item of items) {
      statements.push({ sql: 'UPDATE productos SET stock = stock - ? WHERE id = ?', args: [item.cantidad, item.productoId] });
      statements.push({ sql: 'INSERT INTO ventas (fecha, productoId, producto, cantidad, totalCentavos, usuarioId, vendedor, cobroId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [header.fecha, item.productoId, item.producto, item.cantidad, item.totalCentavos, user.id, header.vendedor, header.id] });
    }
    await tx.batch(statements);
    const alertas = items.filter(item => item.stockFinal <= item.stockMinimo).map(item => item.producto + ': ' + item.stockFinal + ' unidades');
    return { venta: presentarVenta(header, items), alerta: alertas.length ? 'Stock bajo: ' + alertas.join('; ') : null, repetida: false };
  });
}

function ventasRouter(db) {
  const router = express.Router();
  router.get('/', async (req, res, next) => {
    try {
      const ventas = await db.withTransaction(async tx => {
        const headers = await tx.all('SELECT ' + headerColumns + ' FROM cobros ORDER BY fecha DESC, id DESC');
        const lines = await tx.all('SELECT * FROM ventas ORDER BY id');
        const groups = new Map();
        for (const line of lines) if (line.cobroId !== null) {
          if (!groups.has(line.cobroId)) groups.set(line.cobroId, []);
          groups.get(line.cobroId).push(line);
        }
        return [...headers.map(h => presentarVenta(h, groups.get(h.id) || [])), ...lines.filter(line => line.cobroId === null).map(line => presentarVenta(line, [line], true))].sort((a,b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
      }, 'read');
      res.json(ventas);
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try { res.json({ mensaje: 'Venta registrada con éxito', ...await registrarCompra(db, req.body, req.user) }); }
    catch (error) { if (error.status) return res.status(error.status).json({ error: error.message, ...error.extra }); next(error); }
  });
  router.get('/:id/comprobante', async (req, res, next) => {
    try {
      const venta = await db.withTransaction(tx => obtenerVenta(tx, req.params.id), 'read');
      const pdf = await generarComprobante(venta);
      res.type('application/pdf').attachment('nova-salud-' + venta.numero + '.pdf').send(pdf);
    } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
  });
  return router;
}
module.exports = { ventasRouter, registrarCompra, obtenerVenta };
