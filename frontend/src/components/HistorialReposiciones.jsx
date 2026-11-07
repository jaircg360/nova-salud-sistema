import { useEffect, useState } from 'react';
import api from '../api';
import './Reposiciones.css';

const dinero = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n/100);
export default function HistorialReposiciones({ version }) {
  const [datos,setDatos] = useState([]);
  const [estado,setEstado] = useState('cargando');
  const [intento,setIntento] = useState(0);
  useEffect(() => {
    let activo=true;
    api.get('/reposiciones').then(res => { if (activo) { setDatos(res.data); setEstado('listo'); } }).catch(() => { if (activo) setEstado('error'); });
    return () => { activo=false; };
  },[version,intento]);
  return <section className="pf-stock-history" aria-labelledby="ingresos-titulo">
    <div className="pf-stock-history-head"><div><h3 id="ingresos-titulo">Historial de abastecimiento</h3><p>Últimos 100 ingresos registrados con el nuevo formulario.</p></div><button type="button" onClick={() => { setEstado('cargando'); setIntento(n=>n+1); }}>Actualizar historial</button></div>
    {estado==='cargando' ? <p role="status">Cargando ingresos…</p> : estado==='error' ? <p className="pf-stock-error" role="alert">No se pudo cargar el historial. Pulsa Actualizar historial para reintentar.</p> : !datos.length ? <p>Todavía no hay ingresos registrados. Las existencias anteriores se conservan.</p> : <div className="pf-stock-entries">{datos.map(r => <details key={r.id}>
      <summary><span><strong>{r.producto}</strong><span>{r.proveedor} · {r.fechaRecepcion.split('-').reverse().join('/')}</span></span><b>+{r.cantidad} und.</b></summary>
      <dl><div><dt>Stock anterior → posterior</dt><dd>{r.stockAnterior} → {r.stockPosterior} unidades</dd></div><div><dt>Registrado por</dt><dd>{r.usuario}</dd></div><div><dt>Documento</dt><dd>{r.documento || 'Sin documento'}</dd></div><div><dt>Costo unitario de compra</dt><dd>{r.costoUnitarioCentavos===null ? 'Sin registrar' : dinero(r.costoUnitarioCentavos)}</dd></div><div><dt>Costo total del ingreso</dt><dd>{r.costoUnitarioCentavos===null ? 'Sin registrar' : dinero(r.costoUnitarioCentavos*r.cantidad)}</dd></div><div><dt>Fecha de registro (Lima)</dt><dd>{new Date(r.fecha).toLocaleString('es-PE',{timeZone:'America/Lima'})}</dd></div><div className="pf-stock-wide"><dt>Observaciones</dt><dd>{r.observaciones || 'Sin observaciones'}</dd></div></dl>
    </details>)}</div>}
  </section>;
}
