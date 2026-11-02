const express = require('express');
const { generarPDF } = require('./reporte-pdf');

function validarPeriodo(query) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const desde = query.desde ?? hoy.slice(0, 8) + '01';
  const hasta = query.hasta ?? hoy;
  const valida = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= '2000-01-01' && value <= '9998-12-31'
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valida(desde) || !valida(hasta) || desde > hasta || Date.parse(hasta) - Date.parse(desde) > 365 * 86400000) {
    const error = new Error('Selecciona fechas válidas, desde menor o igual a hasta y un máximo de 366 días.');
    error.status = 400;
    throw error;
  }
  // Lima is UTC-5. The end is exclusive, including the whole selected last day.
  return { desde, hasta, inicioUTC: desde + 'T05:00:00.000Z', finUTC: new Date(Date.parse(hasta + 'T05:00:00.000Z') + 86400000).toISOString() };
}

async function obtenerReporte(db, periodo) {
  return db.withTransaction(async tx => {
    const filtro = ' WHERE fecha >= ? AND fecha < ?';
    const args = [periodo.inicioUTC, periodo.finUTC];
    const resumen = await tx.get('SELECT COALESCE(SUM(totalCentavos), 0) AS totalCentavos, COUNT(DISTINCT COALESCE(cobroId, -id)) AS cantidadVentas, COALESCE(SUM(cantidad), 0) AS unidadesVendidas FROM ventas' + filtro, ...args);
    const porDia = await tx.all("SELECT date(fecha, '-5 hours') AS fecha, SUM(totalCentavos) AS totalCentavos, COUNT(DISTINCT COALESCE(cobroId, -id)) AS cantidadVentas, SUM(cantidad) AS unidades FROM ventas" + filtro + ' GROUP BY 1 ORDER BY 1', ...args);
    const productosMasVendidos = await tx.all('SELECT productoId, MAX(producto) AS nombre, SUM(cantidad) AS unidades, SUM(totalCentavos) AS totalCentavos FROM ventas' + filtro + ' GROUP BY productoId ORDER BY unidades DESC, totalCentavos DESC, productoId LIMIT 10', ...args);
    const vendedores = await tx.all('SELECT usuarioId, MAX(vendedor) AS nombre, COUNT(DISTINCT COALESCE(cobroId, -id)) AS cantidadVentas, SUM(cantidad) AS unidades, SUM(totalCentavos) AS totalCentavos FROM ventas' + filtro + ' GROUP BY usuarioId ORDER BY totalCentavos DESC, usuarioId', ...args);
    const productos = (await tx.all('SELECT id, nombre, precioCentavos, stock, stockMinimo FROM productos ORDER BY nombre COLLATE NOCASE, id')).map(p => ({ ...p, reponer: Math.max(0, p.stockMinimo - p.stock), estado: p.stock === 0 ? 'Agotado' : p.stock <= p.stockMinimo ? 'Stock bajo' : 'Disponible' }));
    return {
      periodo: { desde: periodo.desde, hasta: periodo.hasta, zonaHoraria: 'America/Lima' },
      generadoEn: new Date().toISOString(),
      ventas: { ...resumen, ticketPromedioCentavos: resumen.cantidadVentas ? Math.round(resumen.totalCentavos / resumen.cantidadVentas) : 0 },
      porDia, productosMasVendidos, vendedores,
      inventario: {
        resumen: { productos: productos.length, unidades: productos.reduce((n, p) => n + p.stock, 0), agotados: productos.filter(p => p.stock === 0).length, stockBajo: productos.filter(p => p.stock > 0 && p.stock <= p.stockMinimo).length, valorVentaCentavos: productos.reduce((n, p) => n + p.precioCentavos * p.stock, 0) },
        productos,
      },
    };
  }, 'read');
}

function reportesRouter(db) {
  const router = express.Router();
  router.get(['/', '/pdf'], async (req, res, next) => {
    try {
      const periodo = validarPeriodo(req.query);
      const data = await obtenerReporte(db, periodo);
      if (req.path !== '/pdf') return res.json(data);
      const pdf = await generarPDF(data, req.user.nombre);
      res.type('application/pdf').attachment('nova-salud-reporte-' + periodo.desde + '-a-' + periodo.hasta + '.pdf').send(pdf);
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      next(error);
    }
  });
  return router;
}
module.exports = { validarPeriodo, obtenerReporte, reportesRouter };
