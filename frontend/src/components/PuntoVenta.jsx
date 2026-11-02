import { useEffect, useRef, useState } from 'react';
import { Search, Plus, Minus, X, ShoppingCart, Banknote, Smartphone, CreditCard, Check, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../api';
import { descargarComprobante } from '../comprobantes';

const dinero = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value / 100);
const normalizar = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nuevaCaja = () => ({ items: [], metodoPago: 'Efectivo', recibido: '', pendiente: null, ultimaVenta: null });
function recuperarCaja(key) {
  try {
    const data = JSON.parse(sessionStorage.getItem(key));
    if (data && Array.isArray(data.items) && data.items.length <= 50 && ['Efectivo', 'Yape / Plin', 'Tarjeta'].includes(data.metodoPago)) return { ...nuevaCaja(), ...data };
  } catch { /* An invalid saved draft is safely discarded. */ }
  return nuevaCaja();
}

export default function PuntoVenta({ productos, alRealizarVenta, usuarioId }) {
  const storageKey = 'novaCaja:' + usuarioId;
  const [caja, setCaja] = useState(() => recuperarCaja(storageKey));
  const [busqueda, setBusqueda] = useState('');
  const [soloDisponibles, setSoloDisponibles] = useState(true);
  const [masVendidos, setMasVendidos] = useState(false);
  const [limite, setLimite] = useState(12);
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [confirmarVaciado, setConfirmarVaciado] = useState(false);
  const searchRef = useRef(null);
  const requestLock = useRef(false);

  useEffect(() => { sessionStorage.setItem(storageKey, JSON.stringify(caja)); }, [caja, storageKey]);
  useEffect(() => { if (!enviando && !caja.pendiente) searchRef.current?.focus(); }, [enviando, caja.pendiente]);
  const bloqueado = enviando || Boolean(caja.pendiente);
  const editar = cambios => { setCaja(actual => ({ ...actual, ...cambios })); setMensaje(null); setConfirmarVaciado(false); };
  const total = caja.items.reduce((n, item) => n + item.precioCentavos * (Number(item.cantidad) || 0), 0);
  const recibido = /^\d+(\.\d{0,2})?$/.test(caja.recibido) ? Math.round(Number(caja.recibido) * 100) : null;
  const vuelto = recibido === null ? null : recibido - total;
  const tieneProblemas = caja.items.some(item => {
    const producto = productos.find(p => p.id === item.productoId);
    return !producto || !Number.isSafeInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || Number(item.cantidad) > producto.stock || item.precioCentavos !== Math.round(producto.precio * 100);
  });
  const puedeCobrar = caja.items.length > 0 && !tieneProblemas && total > 0 && total <= 1000000000 && (caja.metodoPago !== 'Efectivo' || (recibido !== null && recibido >= total && recibido <= 1000000000));
  const resultados = productos.filter(p => (!soloDisponibles || p.stock > 0) && normalizar(p.nombre).includes(normalizar(busqueda.trim())) && (!masVendidos || p.vendidos > 0)).sort((a,b) => masVendidos ? (b.vendidos - a.vendidos || a.nombre.localeCompare(b.nombre, 'es')) : (Number(b.stock > 0) - Number(a.stock > 0) || a.nombre.localeCompare(b.nombre, 'es')));

  function agregar(producto) {
    if (bloqueado) return;
    const found = caja.items.find(item => item.productoId === producto.id);
    if ((Number(found?.cantidad) || 0) >= producto.stock) { setMensaje({ tipo: 'error', texto: 'No hay más stock disponible de ' + producto.nombre }); return; }
    if (!found && caja.items.length >= 50) { setMensaje({ tipo: 'error', texto: 'La venta admite hasta 50 productos distintos.' }); return; }
    const items = found ? caja.items.map(item => item.productoId === producto.id ? { ...item, cantidad: (Number(item.cantidad) || 0) + 1 } : item) : [...caja.items, { productoId: producto.id, nombre: producto.nombre, precioCentavos: Math.round(producto.precio * 100), cantidad: 1 }];
    editar({ items }); setBusqueda(''); setLimite(12); searchRef.current?.focus();
  }
  function cantidad(id, value) { if (!bloqueado) editar({ items: caja.items.map(item => item.productoId === id ? { ...item, cantidad: value } : item) }); }
  function quitar(id) { if (!bloqueado) editar({ items: caja.items.filter(item => item.productoId !== id) }); }
  function actualizarPrecios() {
    editar({ items: caja.items.map(item => { const p = productos.find(p => p.id === item.productoId); return p ? { ...item, precioCentavos: Math.round(p.precio * 100) } : item; }) });
  }

  async function cobrar(e) {
    e.preventDefault();
    if (requestLock.current || (!caja.pendiente && !puedeCobrar)) return;
    requestLock.current = true; setEnviando(true); setMensaje(null);
    const payload = caja.pendiente || {
      items: caja.items.map(item => ({ productoId: item.productoId, cantidad: Number(item.cantidad), precioCentavos: item.precioCentavos })),
      metodoPago: caja.metodoPago, recibidoCentavos: caja.metodoPago === 'Efectivo' ? recibido : null, clave: crypto.randomUUID(),
    };
    const pendiente = { ...caja, pendiente: payload };
    // Persist before sending: a reload or lost response must reuse exactly this request.
    sessionStorage.setItem(storageKey, JSON.stringify(pendiente)); setCaja(pendiente);
    try {
      const { data } = await api.post('/ventas', payload);
      const siguiente = { ...nuevaCaja(), ultimaVenta: data.venta };
      sessionStorage.setItem(storageKey, JSON.stringify(siguiente)); setCaja(siguiente);
      setMensaje({ tipo: 'exito', texto: 'Venta ' + data.venta.numero + ' registrada por ' + dinero(data.venta.totalCentavos) + (data.alerta ? '. ' + data.alerta : '') });
      searchRef.current?.focus();
      void Promise.resolve().then(alRealizarVenta).catch(() => {});
    } catch (err) {
      const status = err.response?.status;
      const incierto = !status || status >= 500 || status === 408 || status === 429;
      if (!incierto) {
        const editable = { ...pendiente, pendiente: null };
        sessionStorage.setItem(storageKey, JSON.stringify(editable)); setCaja(editable);
        void alRealizarVenta();
      }
      setMensaje({ tipo: 'error', texto: incierto ? 'No pudimos confirmar la respuesta del servidor. Conservamos la compra: reintenta la confirmación para comprobarla sin duplicarla.' : err.response?.data?.error || 'No se pudo registrar la venta.' });
    } finally { requestLock.current = false; setEnviando(false); }
  }
  async function descargar() {
    if (!caja.ultimaVenta || descargando) return;
    setDescargando(true);
    try { await descargarComprobante(caja.ultimaVenta); }
    catch { setMensaje({ tipo: 'error', texto: 'La venta está guardada, pero no se pudo descargar el comprobante. Puedes reintentarlo aquí o desde Historial.' }); }
    finally { setDescargando(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><h2 className="text-2xl font-bold text-slate-900">Punto de venta</h2><p className="text-sm text-slate-500 mt-1">Busca, agrega y cobra en una sola venta.</p></div><span className="text-xs text-emerald-700 bg-emerald-50 rounded-full px-3 py-1">Nueva venta</span></div>
    {mensaje && <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={'p-4 rounded-xl border text-sm ' + (mensaje.tipo === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>{mensaje.texto}</p>}
    {caja.ultimaVenta && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><div className="text-sm"><strong>Última venta: {caja.ultimaVenta.numero}</strong><p className="text-slate-600">{dinero(caja.ultimaVenta.totalCentavos)} · {caja.ultimaVenta.metodoPago}{caja.ultimaVenta.vueltoCentavos !== null && ' · Vuelto: ' + dinero(caja.ultimaVenta.vueltoCentavos)}</p></div><button type="button" onClick={descargar} disabled={descargando} className="flex items-center gap-2 border border-emerald-300 bg-white text-emerald-800 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"><Download size={16} /> {descargando ? 'Descargando...' : 'Comprobante PDF'}</button></div>}
    <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)] gap-6 items-start">
      <section className="min-w-0" aria-label="Buscar productos">
        <label className="flex items-center gap-3 border-2 border-emerald-500 rounded-xl px-3 py-3 bg-white"><Search size={20} className="text-emerald-600 shrink-0" /><input ref={searchRef} type="search" aria-label="Buscar producto" autoComplete="off" placeholder="Buscar por nombre del producto..." disabled={bloqueado} value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(12); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const first = resultados.find(p => p.stock > (Number(caja.items.find(i => i.productoId === p.id)?.cantidad) || 0)); if (first) agregar(first); } }} className="min-w-0 w-full outline-none text-sm disabled:opacity-50" /><kbd className="text-xs text-slate-400 hidden sm:block whitespace-nowrap">Enter ↵</kbd></label>
        <div className="flex flex-wrap items-center gap-2 my-4"><button type="button" disabled={bloqueado} aria-pressed={!masVendidos} onClick={() => { setMasVendidos(false); setLimite(12); }} className={'px-3 py-1.5 rounded-full border text-xs font-semibold ' + (!masVendidos ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600')}>Todos</button><button type="button" disabled={bloqueado} aria-pressed={masVendidos} onClick={() => { setMasVendidos(true); setLimite(12); }} className={'px-3 py-1.5 rounded-full border text-xs font-semibold ' + (masVendidos ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600')}>Más vendidos</button><label className="flex items-center gap-2 text-xs text-slate-500 ml-auto"><input type="checkbox" checked={soloDisponibles} disabled={bloqueado} onChange={e => { setSoloDisponibles(e.target.checked); setLimite(12); }} />Solo disponibles</label></div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden" aria-live="polite">
          {resultados.slice(0,limite).map(producto => {
            const enCarrito = Number(caja.items.find(i => i.productoId === producto.id)?.cantidad) || 0;
            return <div key={producto.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-4 hover:bg-slate-50"><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 break-words">{producto.nombre}</p><p className={'text-xs mt-1 ' + (producto.stock === 0 ? 'text-red-600' : producto.stock <= producto.stockMinimo ? 'text-amber-700' : 'text-slate-500')}>{producto.stock === 0 ? 'Agotado' : 'Stock: ' + producto.stock}{enCarrito > 0 && ' · En carrito: ' + enCarrito}</p></div><span className="text-sm font-bold whitespace-nowrap">{dinero(Math.round(producto.precio * 100))}</span><button type="button" aria-label={'Agregar ' + producto.nombre} disabled={bloqueado || enCarrito >= producto.stock} onClick={() => agregar(producto)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold disabled:opacity-40 shrink-0"><Plus size={16} />Agregar</button></div>;
          })}
          {!resultados.length && <p className="p-8 text-center text-sm text-slate-500">{productos.length ? 'No encontramos productos con esos filtros.' : 'No hay productos cargados. Agrega productos desde Inventario.'}</p>}
        </div>
        {resultados.length > limite && <button type="button" disabled={bloqueado} onClick={() => setLimite(limite+12)} className="block mx-auto mt-3 text-sm text-emerald-700 font-semibold px-4 py-2">Ver más ({resultados.length-limite})</button>}
        <p className="text-xs text-slate-500 mt-3">Enter agrega la primera coincidencia disponible. El carrito se conserva en esta pestaña.</p>
      </section>

      <form onSubmit={cobrar} aria-label="Carrito y cobro" className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/50 min-w-0 lg:sticky lg:top-20">
        <div className="flex justify-between items-center gap-2 border-b border-slate-200 pb-4"><h3 className="font-bold flex items-center gap-2"><ShoppingCart size={18} className="text-emerald-600" />Venta actual <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{caja.items.length}</span></h3><button type="button" disabled={bloqueado || !caja.items.length} onClick={() => setConfirmarVaciado(!confirmarVaciado)} className="text-xs text-slate-500 hover:text-red-600 disabled:opacity-40">Vaciar</button></div>
        {confirmarVaciado && <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 my-3"><p>¿Quitar todos los productos del carrito?</p><div className="flex gap-4 mt-2"><button type="button" onClick={() => editar({ items: [], recibido: '' })} className="text-red-700 font-semibold">Sí, vaciar</button><button type="button" onClick={() => setConfirmarVaciado(false)}>Conservar</button></div></div>}
        <div className="divide-y divide-slate-200">
          {!caja.items.length && <p className="text-sm text-slate-500 text-center py-8">Agrega productos para comenzar.</p>}
          {caja.items.map(item => {
            const p = productos.find(p => p.id === item.productoId);
            const sinStock = !p || Number(item.cantidad) > p.stock;
            const cambioPrecio = p && item.precioCentavos !== Math.round(p.precio * 100);
            return <div key={item.productoId} className="py-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold text-sm break-words min-w-0">{item.nombre}</p><button type="button" aria-label={'Quitar ' + item.nombre} disabled={bloqueado} onClick={() => quitar(item.productoId)} className="text-slate-400 hover:text-red-500 p-1 shrink-0 disabled:opacity-40"><X size={16} /></button></div><p className="text-xs text-slate-500 mt-1">{dinero(item.precioCentavos)} por unidad</p><div className="flex items-center justify-between gap-3 mt-3"><div className="inline-flex items-center border border-slate-300 bg-white rounded-lg"><button type="button" aria-label={'Reducir ' + item.nombre} disabled={bloqueado || Number(item.cantidad) <= 1} onClick={() => cantidad(item.productoId,Number(item.cantidad)-1)} className="p-2 disabled:opacity-30"><Minus size={14} /></button><input type="number" aria-label={'Cantidad de ' + item.nombre} min="1" max={p?.stock || 1} step="1" required disabled={bloqueado} value={item.cantidad} onChange={e => cantidad(item.productoId,e.target.value)} className="w-12 text-center text-sm bg-transparent outline-none py-1" /><button type="button" aria-label={'Aumentar ' + item.nombre} disabled={bloqueado || !p || Number(item.cantidad)>=p.stock} onClick={() => cantidad(item.productoId,(Number(item.cantidad)||0)+1)} className="p-2 disabled:opacity-30"><Plus size={14} /></button></div><strong className="text-sm whitespace-nowrap">{dinero(item.precioCentavos*(Number(item.cantidad)||0))}</strong></div>{sinStock && <p className="text-xs text-red-600 mt-2" role="alert">{p ? 'Stock disponible: '+p.stock+'. Ajusta la cantidad.' : 'Producto no disponible. Quítalo del carrito.'}</p>}{cambioPrecio && <button type="button" disabled={bloqueado} onClick={actualizarPrecios} className="text-xs text-amber-700 underline mt-2">Precio actual: {dinero(Math.round(p.precio*100))}. Actualizar precios.</button>}</div>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-5 border-t border-slate-200"><span className="text-sm text-slate-500">Total a cobrar</span><strong className="text-3xl font-bold text-slate-900" data-testid="total-caja">{dinero(total)}</strong></div>
        <fieldset disabled={bloqueado}><legend className="text-sm font-semibold mb-2">Método de pago</legend><div className="grid grid-cols-3 gap-2">{[['Efectivo',Banknote],['Yape / Plin',Smartphone],['Tarjeta',CreditCard]].map(([name,Icon]) => <button type="button" key={name} aria-pressed={caja.metodoPago===name} onClick={() => editar({ metodoPago:name })} className={'flex flex-col items-center gap-1 border rounded-lg py-3 px-1 text-xs ' + (caja.metodoPago===name ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}><Icon size={18} />{name}</button>)}</div></fieldset>
        {caja.metodoPago==='Efectivo' ? <div className="my-4"><label className="block text-sm text-slate-600">Monto recibido (S/)<input type="number" aria-label="Monto recibido" inputMode="decimal" min="0.01" step="0.01" required disabled={bloqueado} value={caja.recibido} onChange={e => editar({ recibido:e.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" placeholder="0.00" /></label><div className={'flex justify-between mt-2 text-sm '+(vuelto!==null&&vuelto<0?'text-red-600':'text-emerald-700')}><span>{vuelto!==null&&vuelto<0?'Falta recibir':'Vuelto'}</span><strong>{vuelto===null?'—':dinero(Math.abs(vuelto))}</strong></div></div> : <p className="my-4 text-xs text-slate-500">Verifica que recibiste el pago antes de finalizar. Este registro no procesa cobros electrónicos.</p>}
        {caja.pendiente && <p role="status" className="flex gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-xs my-3"><AlertTriangle size={16} className="shrink-0" />Confirmación pendiente. La compra está protegida contra duplicados; reintenta antes de iniciar otra venta.</p>}
        <button type="submit" disabled={enviando || (!caja.pendiente && !puedeCobrar)} className="w-full flex items-center justify-center flex-wrap gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">{caja.pendiente ? <RefreshCw size={18} /> : <Check size={18} />}{enviando?'Registrando...':caja.pendiente?'Reintentar confirmación':'Finalizar venta'}<span className="ml-auto">{dinero(total)}</span></button>
        <p className="text-xs text-slate-500 text-center mt-3">{caja.items.length} {caja.items.length===1?'producto':'productos'} · {caja.items.reduce((n,item)=>n+(Number(item.cantidad)||0),0)} {caja.items.reduce((n,item)=>n+(Number(item.cantidad)||0),0)===1?'unidad':'unidades'}</p>
      </form>
    </div>
  </div>;
}
