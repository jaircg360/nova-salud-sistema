import { useEffect, useState } from 'react';
import { Download, RefreshCw, FileBarChart, AlertTriangle } from 'lucide-react';
import api from '../api';

const dinero = cents => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
const fecha = value => value.split('-').reverse().join('/');
function periodoInicial() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  return { desde: hoy.slice(0, 8) + '01', hasta: hoy };
}

function Tabla({ titulo, columnas, filas }) {
  return <section className="border border-slate-200 rounded-xl overflow-hidden">
    <h3 className="font-bold text-slate-800 p-4 bg-slate-50 border-b border-slate-200">{titulo}</h3>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-slate-500 bg-white"><tr>{columnas.map(c => <th key={c} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {filas.length ? filas.map((fila, i) => <tr key={i} className="hover:bg-slate-50">{fila.map((valor, j) => <td key={j} className="px-4 py-3 align-top">{valor}</td>)}</tr>) : <tr><td colSpan={columnas.length} className="p-6 text-center text-slate-500">No hay registros para mostrar.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [filtro, setFiltro] = useState(periodoInicial);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/reportes', { params: periodo, signal: controller.signal })
      .then(res => { if (!controller.signal.aborted) setData(res.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'No se pudo cargar el reporte. Reintenta.'); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [periodo]);

  function consultar(e) {
    e.preventDefault();
    if (filtro.desde > filtro.hasta || Date.parse(filtro.hasta) - Date.parse(filtro.desde) > 365 * 86400000) {
      setError('El rango debe ser válido y abarcar como máximo 366 días.'); return;
    }
    setError(''); setCargando(true); setData(null); setPeriodo({ ...filtro });
  }

  async function descargarPDF() {
    if (!data || exportando) return;
    setExportando(true); setError('');
    try {
      const { desde, hasta } = data.periodo;
      const response = await api.get('/reportes/pdf', { params: { desde, hasta }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = 'nova-salud-reporte-' + desde + '-a-' + hasta + '.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      let message = 'No se pudo descargar el PDF. Reintenta.';
      if (err.response?.data instanceof Blob) {
        try { message = JSON.parse(await err.response.data.text()).error || message; } catch { /* Keep the connection error message. */ }
      }
      setError(message);
    } finally { setExportando(false); }
  }

  const productos = data?.inventario.productos.filter(p => !soloAlertas || p.estado !== 'Disponible') || [];
  const maxVentaDiaria = Math.max(1, ...(data?.porDia.map(d => d.totalCentavos) || []));
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between items-start gap-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><FileBarChart className="text-emerald-600" /> Reportes</h2>
        <p className="text-sm text-slate-500 mt-1">Consulta tus ventas y las existencias actuales. Fechas en horario de Lima.</p>
      </div>
      <button onClick={descargarPDF} disabled={!data || cargando || exportando} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 font-semibold">
        <Download size={18} /> {exportando ? 'Generando PDF...' : 'Descargar PDF'}
      </button>
    </div>

    <form onSubmit={consultar} className="flex flex-wrap items-end gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
      <label className="text-sm font-semibold text-slate-700">Desde
        <input type="date" required min="2000-01-01" max={filtro.hasta} value={filtro.desde} disabled={cargando || exportando} onChange={e => setFiltro({ ...filtro, desde: e.target.value })} className="block mt-1 border border-slate-300 bg-white rounded-lg px-3 py-2" />
      </label>
      <label className="text-sm font-semibold text-slate-700">Hasta
        <input type="date" required min={filtro.desde} max="9998-12-31" value={filtro.hasta} disabled={cargando || exportando} onChange={e => setFiltro({ ...filtro, hasta: e.target.value })} className="block mt-1 border border-slate-300 bg-white rounded-lg px-3 py-2" />
      </label>
      <button disabled={cargando || exportando} className="flex items-center gap-2 border border-slate-300 rounded-lg px-4 py-2 bg-white hover:bg-slate-100 font-semibold disabled:opacity-50"><RefreshCw size={16} /> {cargando ? 'Consultando...' : 'Consultar'}</button>
    </form>
    {error && <p role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</p>}
    {cargando && <p role="status" className="py-8 text-center text-slate-500">Cargando reporte...</p>}

    {data && <>
      <p className="text-sm text-slate-500">Ventas del {fecha(data.periodo.desde)} al {fecha(data.periodo.hasta)}. Consulta: {new Date(data.generadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima' })}.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ['Importe vendido', dinero(data.ventas.totalCentavos)], ['Operaciones de venta', data.ventas.cantidadVentas],
          ['Unidades vendidas', data.ventas.unidadesVendidas], ['Venta promedio', dinero(data.ventas.ticketPromedioCentavos)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><p className="text-sm text-slate-600">{label}</p><p className="font-bold text-2xl text-emerald-800 mt-2">{value}</p></div>)}
      </div>
      <p className="text-xs text-slate-500">Los importes son ventas; no representan ganancias. El PDF consulta los datos disponibles al momento de descargarlo.</p>
      <Tabla titulo="Ventas diarias" columnas={['Fecha', 'Operaciones', 'Unidades', 'Importe vendido']} filas={data.porDia.map(d => [fecha(d.fecha), d.cantidadVentas, d.unidades, <div key={d.fecha} className="min-w-32"><span className="font-semibold">{dinero(d.totalCentavos)}</span><div className="bg-slate-100 h-1.5 rounded-full mt-2" aria-hidden="true"><div className="bg-emerald-500 h-full rounded-full" style={{ width: (100 * d.totalCentavos / maxVentaDiaria) + '%' }} /></div></div>])} />
      <div className="grid xl:grid-cols-2 gap-6">
        <Tabla titulo="Productos más vendidos · Top 10 por unidades" columnas={['Producto', 'Unidades', 'Ventas']} filas={data.productosMasVendidos.map(p => [p.nombre, p.unidades, dinero(p.totalCentavos)])} />
        <Tabla titulo="Ventas por vendedor" columnas={['Vendedor', 'Operaciones', 'Unidades', 'Ventas']} filas={data.vendedores.map(v => [v.nombre, v.cantidadVentas, v.unidades, dinero(v.totalCentavos)])} />
      </div>
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <h3 className="text-lg font-bold">Inventario actual</h3>
        <p className="text-sm text-slate-500">Existencias al consultar. El filtro de fechas se aplica a las ventas; este inventario muestra el estado actual.</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ['Productos', data.inventario.resumen.productos], ['Unidades en stock', data.inventario.resumen.unidades],
            ['Agotados', data.inventario.resumen.agotados], ['Con stock bajo', data.inventario.resumen.stockBajo],
          ].map(([label, value]) => <div key={label} className="p-4 bg-slate-50 border border-slate-200 rounded-xl"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold mt-1">{value}</p></div>)}
        </div>
        <p className="text-sm text-slate-600">Valor del stock a precio de venta: <strong>{dinero(data.inventario.resumen.valorVentaCentavos)}</strong>. No corresponde al costo de compra.</p>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={soloAlertas} onChange={e => setSoloAlertas(e.target.checked)} /><AlertTriangle size={16} className="text-amber-600" /> Mostrar solo agotados y stock bajo</label>
        <Tabla titulo="Existencias y reposición" columnas={['Producto', 'Stock', 'Mínimo', 'Por reponer', 'Estado']} filas={productos.map(p => [p.nombre, p.stock, p.stockMinimo, p.reponer, <span key={p.id} className={'inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ' + (p.estado === 'Agotado' ? 'bg-red-50 text-red-700' : p.estado === 'Stock bajo' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{p.estado}</span>])} />
        <p className="text-xs text-slate-500">Por reponer: unidades para alcanzar el mínimo configurado. Si ya estás en el mínimo, indica 0. El PDF incluye el inventario completo.</p>
      </section>
    </>}
  </div>;
}
