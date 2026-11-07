import { useEffect, useRef, useState } from 'react';
import api from '../api';
import './Reposiciones.css';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const vacio = () => ({ cantidad:'', proveedor:'', fechaRecepcion:hoy(), documento:'', costoUnitario:'', observaciones:'' });
function recuperar(key) {
  try { const value = JSON.parse(sessionStorage.getItem(key)); return value?.clave && value?.proveedor ? value : null; }
  catch { return null; }
}
export default function ReponerStock({ producto, usuarioId, onCerrar, onGuardado }) {
  const storageKey = `pf-reposicion:${usuarioId}:${producto.id}`;
  const [pendiente, setPendiente] = useState(() => recuperar(storageKey));
  const [form, setForm] = useState(() => recuperar(storageKey) || vacio());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const lock = useRef(false);
  const ocupado = enviando || Boolean(pendiente);
  useEffect(() => {
    const element = dialog.current;
    const anterior = document.activeElement;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; anterior?.focus(); };
  }, []);
  const cambiar = e => { setForm({ ...form, [e.target.name]:e.target.value }); setError(''); };
  async function guardar(e) {
    e.preventDefault();
    if (lock.current) return;
    const payload = pendiente || { ...form, cantidad:Number(form.cantidad), clave:crypto.randomUUID() };
    try { sessionStorage.setItem(storageKey,JSON.stringify(payload)); }
    catch { setError('No se pudo conservar la solicitud. Habilita el almacenamiento del navegador para registrar la reposición.'); return; }
    lock.current = true; setEnviando(true); setPendiente(payload); setError('');
    try {
      await api.put(`/productos/${producto.id}/reponer`,payload);
      sessionStorage.removeItem(storageKey);
      onGuardado(); onCerrar();
    } catch (err) {
      if ([400,404,409].includes(err.response?.status)) { sessionStorage.removeItem(storageKey); setPendiente(null); }
      setError(err.response?.data?.error || 'No pudimos confirmar la respuesta. Reintenta con los mismos datos; el stock no se duplicará.');
    } finally { lock.current = false; setEnviando(false); }
  }
  function teclado(e) {
    if (e.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
    const first=items[0], last=items.at(-1);
    if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus(); }
  }
  return <dialog ref={dialog} className="pf-stock-dialog" aria-labelledby="reposicion-titulo" onKeyDown={teclado} onCancel={e => { e.preventDefault(); if (!enviando) onCerrar(); }}>
    <form onSubmit={guardar}>
      <header className="pf-stock-head"><div><p className="pf-stock-eyebrow">INGRESO DE MERCADERÍA</p><h2 id="reposicion-titulo">Reponer stock</h2></div><button type="button" className="pf-stock-close" disabled={enviando} onClick={onCerrar} aria-label="Cerrar formulario">×</button></header>
      <div className="pf-stock-product"><strong>{producto.nombre}</strong><span>Stock actual: <b>{producto.stock}</b> unidades{Number(form.cantidad)>0 && !pendiente ? <> · Después del ingreso: <b>{producto.stock+Number(form.cantidad)}</b></> : null}</span></div>
      <p className="pf-stock-help">Registra quién abastece el producto. Los campos con * son obligatorios.</p>
      {pendiente && <p className="pf-stock-notice" role="status">Hay una solicitud pendiente de confirmar. Reintenta para consultar o completar el mismo ingreso de {pendiente.cantidad} unidades.</p>}
      <div className="pf-stock-grid">
        <label>Cantidad a ingresar *<input autoFocus name="cantidad" type="number" min="1" max="100000000" step="1" required disabled={ocupado} value={form.cantidad} onChange={cambiar} /></label>
        <label>Fecha de recepción *<input name="fechaRecepcion" type="date" min="2000-01-01" max={hoy()} required disabled={ocupado} value={form.fechaRecepcion} onChange={cambiar} /></label>
        <label className="pf-stock-wide">Proveedor / razón social *<input name="proveedor" maxLength="160" required disabled={ocupado} value={form.proveedor} onChange={cambiar} placeholder="Ej. Distribuidora farmacéutica" /></label>
        <label>Documento de referencia<input name="documento" maxLength="100" disabled={ocupado} value={form.documento} onChange={cambiar} placeholder="Factura, boleta o guía" /></label>
        <label>Costo unitario de compra (S/)<input name="costoUnitario" type="number" min="0" max="1000000" step="0.01" disabled={ocupado} value={form.costoUnitario} onChange={cambiar} placeholder="Opcional" /></label>
        <label className="pf-stock-wide">Observaciones<textarea name="observaciones" maxLength="1000" rows="3" disabled={ocupado} value={form.observaciones} onChange={cambiar} placeholder="Detalles de la entrega o del abastecimiento" /></label>
      </div>
      <p className="pf-stock-help">Se guardará el usuario responsable y el cambio de existencias. El costo de compra no modifica el precio de venta.</p>
      {error && <p className="pf-stock-error" role="alert">{error}</p>}
      <footer className="pf-stock-actions"><button type="button" disabled={enviando} onClick={onCerrar}>Cerrar</button><button type="submit" className="pf-stock-primary" disabled={enviando}>{enviando ? 'Registrando…' : pendiente ? 'Reintentar confirmación' : 'Registrar ingreso'}</button></footer>
    </form>
  </dialog>;
}
