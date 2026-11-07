const { Router } = require('express');
const { createHash } = require('node:crypto');
const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
function validar(body) {
  const { cantidad, proveedor, fechaRecepcion, documento = '', observaciones = '', costoUnitario = null, clave } = body || {};
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 100000000) throw new Error('Ingresa una cantidad entera positiva');
  for (const [valor, max, nombre] of [[proveedor,160,'proveedor'],[documento,100,'documento'],[observaciones,1000,'observaciones']]) {
    if (typeof valor !== 'string' || valor.trim().length > max) throw new Error(`Revisa el campo ${nombre} (máximo ${max} caracteres)`);
  }
  if (!proveedor.trim()) throw new Error('Indica el proveedor que abastece el producto');
  if (typeof fechaRecepcion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaRecepcion) || !Number.isFinite(Date.parse(fechaRecepcion)) || new Date(fechaRecepcion).toISOString().slice(0,10) !== fechaRecepcion || fechaRecepcion < '2000-01-01' || fechaRecepcion > hoyLima()) throw new Error('Ingresa una fecha de recepción válida, entre el año 2000 y hoy');
  if (typeof clave !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(clave)) throw new Error('Falta el identificador de la reposición. Vuelve a abrir el formulario');
  let costoUnitarioCentavos = null;
  if (costoUnitario !== null && costoUnitario !== '') {
    if (!['number','string'].includes(typeof costoUnitario) || !/^\d+(\.\d{1,2})?$/.test(String(costoUnitario))) throw new Error('El costo unitario debe tener como máximo dos decimales');
    costoUnitarioCentavos = Math.round(Number(costoUnitario)*100);
    if (!Number.isSafeInteger(costoUnitarioCentavos) || costoUnitarioCentavos < 0 || costoUnitarioCentavos > 100000000 || !Number.isSafeInteger(costoUnitarioCentavos*cantidad)) throw new Error('Costo fuera de rango');
  }
  return { cantidad, proveedor: proveedor.trim(), fechaRecepcion, documento: documento.trim(), observaciones: observaciones.trim(), costoUnitarioCentavos, clave };
}
function reposicionesRouter(db) {
  const router = Router();
  router.get('/reposiciones', async (req,res) => {
    const rows = await db.all('SELECT * FROM reposiciones ORDER BY id DESC LIMIT 100');
    res.json(rows);
  });
  router.put('/productos/:id/reponer', async (req,res) => {
    const productoId = Number(req.params.id);
    if (!Number.isSafeInteger(productoId) || productoId < 1) return res.status(400).json({ error: 'ID inválido' });
    let entrada;
    try { entrada = validar(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const { cantidad, proveedor, fechaRecepcion, documento, observaciones, costoUnitarioCentavos, clave } = entrada;
    const huella = createHash('sha256').update(JSON.stringify({ productoId, ...entrada })).digest('hex');
    const result = await db.withTransaction(async tx => {
      const anterior = await tx.get('SELECT * FROM reposiciones WHERE usuarioId = ? AND clave = ?', req.user.id, clave);
      if (anterior && anterior.huella !== huella) return { status:409, body:{ error:'Esta solicitud ya se utilizó con otros datos. Conserva los datos originales para reintentar.' } };
      const producto = await tx.get('SELECT id,nombre,stock,stockMinimo,precioCentavos / 100.0 AS precio FROM productos WHERE id = ?', productoId);
      if (!producto) return { status:404, body:{ error:'Producto no encontrado' } };
      if (anterior) return { status:200, body:{ mensaje:'Reposición ya registrada', repetida:true, producto, reposicion:anterior } };
      const stockPosterior = producto.stock + cantidad;
      if (!Number.isSafeInteger(stockPosterior) || stockPosterior > 100000000) return { status:400, body:{ error:'Stock fuera de rango' } };
      await tx.run('UPDATE productos SET stock = stock + ? WHERE id = ?', cantidad, productoId);
      const insert = await tx.run('INSERT INTO reposiciones (fecha,fechaRecepcion,productoId,producto,cantidad,stockAnterior,stockPosterior,proveedor,documento,costoUnitarioCentavos,observaciones,usuarioId,usuario,clave,huella) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', new Date().toISOString(), fechaRecepcion, productoId, producto.nombre, cantidad, producto.stock, stockPosterior, proveedor, documento, costoUnitarioCentavos, observaciones, req.user.id, req.user.nombre, clave, huella);
      return { status:200, body:{ mensaje:'Stock repuesto y abastecimiento registrado', producto:{ ...producto, stock:stockPosterior }, reposicion:await tx.get('SELECT * FROM reposiciones WHERE id = ?', insert.lastInsertRowid) } };
    });
    res.status(result.status).json(result.body);
  });
  return router;
}
module.exports = { reposicionesRouter };
