import { useState, useEffect } from 'react';
import { History as HistoryIcon, Download } from 'lucide-react';
import api from '../api';
import { descargarComprobante } from '../comprobantes';

const dinero = cents => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents/100);
export default function Historial() {
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/ventas', { signal: controller.signal }).then(res => setVentas(res.data)).catch(() => { if (!controller.signal.aborted) setError('No se pudo cargar el historial. Vuelve a abrir esta pestaña para reintentar.'); }).finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, []);
  async function descargar(venta) {
    if (descargando) return;
    setDescargando(venta.id); setError('');
    try { await descargarComprobante(venta); }
    catch { setError('No se pudo descargar el comprobante. La venta sigue guardada; vuelve a intentar.'); }
    finally { setDescargando(null); }
  }
  return <div className="space-y-4">
    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><HistoryIcon size={20} />Historial de ventas</h2>
    {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg text-sm">{error}</p>}
    {cargando ? <p role="status" className="text-slate-500">Cargando ventas...</p> : !ventas.length && !error ? <p className="text-slate-500 text-sm">Aún no se han registrado ventas.</p> : ventas.map(venta => <article key={venta.id} className="border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap justify-between items-start gap-3"><div><h3 className="font-semibold">Venta {venta.numero}</h3><p className="text-xs text-slate-500 mt-1">{new Date(venta.fecha).toLocaleString('es-PE',{timeZone:'America/Lima'})} · {venta.vendedor} · {venta.metodoPago}</p></div><strong className="text-emerald-700">{dinero(venta.totalCentavos)}</strong></div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-slate-600">{venta.items.length} productos · {venta.cantidad} unidades · Ver detalle</summary><ul className="mt-3 space-y-2">{venta.items.map(item => <li key={item.productoId} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2"><span>{item.cantidad} × {item.producto}</span><span>{dinero(item.totalCentavos)}</span></li>)}</ul>{venta.recibidoCentavos!==null && <p className="text-xs text-slate-500 mt-3">Recibido: {dinero(venta.recibidoCentavos)} · Vuelto: {dinero(venta.vueltoCentavos)}</p>}</details>
      <button type="button" onClick={() => descargar(venta)} disabled={Boolean(descargando)} className="flex items-center gap-2 text-xs text-emerald-700 font-semibold border border-emerald-200 rounded-lg px-3 py-2 mt-3 disabled:opacity-40"><Download size={15} />{descargando===venta.id?'Descargando...':'Comprobante PDF'}</button>
    </article>)}
  </div>;
}
