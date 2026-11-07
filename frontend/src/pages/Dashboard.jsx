import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, AlertTriangle, History, LogOut, LayoutDashboard, FileBarChart, Menu, X, ChevronRight } from 'lucide-react';
import api from '../api';
import Inicio from '../components/Inicio';
import Productos from '../components/Productos';
import Alertas from '../components/Alertas';
import PuntoVenta from '../components/PuntoVenta';
import Historial from '../components/Historial';
import Reportes from '../components/Reportes';
import './Dashboard.css';

const secciones = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { id: 'productos', label: 'Inventario', icon: Package },
  { id: 'ventas', label: 'Punto de venta', icon: ShoppingCart },
  { id: 'alertas', label: 'Alertas', icon: AlertTriangle },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'reportes', label: 'Reportes', icon: FileBarChart },
];
const iniciales = nombre => nombre.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'PF';

function Sidebar({ activa, seleccionar, cantidadAlertas, usuario, cerrarSesion, cerrandoSesion, errorSesion, cerrarMenu }) {
  return <div className="pf-sidebar-inner">
    <div className="pf-sidebar-brand">
      <img src="/perufarma-logo.svg" alt="PeruFarma" width="184" height="44" />
      {cerrarMenu && <button type="button" onClick={cerrarMenu} className="pf-shell-icon" aria-label="Cerrar menú"><X size={20} /></button>}
    </div>
    <p className="pf-sidebar-subtitle">Sistema de gestión</p>
    <nav className="pf-sidebar-nav" aria-label="Menú principal">
      <p className="pf-sidebar-group">PRINCIPAL</p>
      {secciones.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => seleccionar(id)} aria-current={activa === id ? 'page' : undefined} aria-label={id === 'alertas' && cantidadAlertas ? 'Alertas (' + cantidadAlertas + ')' : label} className={'pf-nav-item' + (activa === id ? ' pf-nav-active' : '')}>
        <Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
        {id === 'alertas' && cantidadAlertas > 0 && <span className="pf-nav-badge" aria-hidden="true">{cantidadAlertas}</span>}
        {activa === id && <span className="pf-nav-indicator" aria-hidden="true" />}
      </button>)}
    </nav>
    <div className="pf-sidebar-bottom">
      <div className="pf-sidebar-account"><span className="pf-user-avatar" aria-hidden="true">{iniciales(usuario)}</span><div><p>{usuario || 'Cargando usuario…'}</p><span>Sesión iniciada</span></div></div>
      {errorSesion && <p className="pf-sidebar-error" role="alert">{errorSesion}</p>}
      <button type="button" className="pf-signout" disabled={cerrandoSesion} onClick={cerrarSesion}><LogOut size={18} aria-hidden="true" />{cerrandoSesion ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
      <p className="pf-sidebar-footer">PeruFarma · Intranet</p>
    </div>
  </div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState(null);
  const [activa, setActiva] = useState('inicio');
  const [productos, setProductos] = useState([]);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [errorSesion, setErrorSesion] = useState('');
  const dialogRef = useRef(null);
  const cantidadAlertas = productos.filter(p => p.stock <= p.stockMinimo).length;
  const titulo = secciones.find(s => s.id === activa).label;

  const cargarDatos = () => api.get('/productos').then(res => setProductos(res.data)).catch(err => console.error('Error al obtener productos', err));
  useEffect(() => {
    cargarDatos();
    api.get('/auth/me').then(res => { setUsuario(res.data.nombre); setUsuarioId(res.data.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (menuAbierto && !dialog.open) dialog.showModal();
    if (!menuAbierto && dialog.open) dialog.close();
    if (!menuAbierto) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [menuAbierto]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => { if (desktop.matches) setMenuAbierto(false); };
    desktop.addEventListener('change', onResize);
    return () => desktop.removeEventListener('change', onResize);
  }, []);

  function seleccionar(id) { setActiva(id); setMenuAbierto(false); }
  function manejarTecladoMenu(e) {
    if (e.key !== 'Tab') return;
    const controles = [...dialogRef.current.querySelectorAll('button:not(:disabled), a[href]')];
    const first = controles[0], last = controles.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  async function cerrarSesion() {
    if (cerrandoSesion) return;
    setCerrandoSesion(true); setErrorSesion('');
    try {
      await api.post('/auth/logout'); sessionStorage.removeItem('novaToken'); navigate('/', { replace: true });
    } catch { setErrorSesion('No se pudo cerrar la sesión. Vuelve a intentarlo.'); }
    finally { setCerrandoSesion(false); }
  }
  const sidebarProps = { activa, seleccionar, cantidadAlertas, usuario, cerrarSesion, cerrandoSesion, errorSesion };

  return <div className="pf-shell">
    <a className="pf-skip-link" href="#contenido-principal">Saltar al contenido</a>
    <aside className="pf-desktop-sidebar" aria-label="Navegación lateral"><Sidebar {...sidebarProps} /></aside>
    <dialog ref={dialogRef} id="pf-menu-movil" className="pf-sidebar-drawer" aria-label="Navegación lateral" onKeyDown={manejarTecladoMenu} onCancel={() => setMenuAbierto(false)} onClose={() => setMenuAbierto(false)} onClick={e => { if (e.target === e.currentTarget) setMenuAbierto(false); }}>
      <Sidebar {...sidebarProps} cerrarMenu={() => setMenuAbierto(false)} />
    </dialog>
    <div className="pf-shell-workspace">
      <header className="pf-topbar">
        <div className="pf-topbar-heading"><button type="button" className="pf-shell-icon pf-menu-trigger" aria-label="Abrir menú" aria-expanded={menuAbierto} aria-controls="pf-menu-movil" onClick={() => setMenuAbierto(true)}><Menu size={22} /></button><div><p className="pf-breadcrumb">PeruFarma <ChevronRight size={12} aria-hidden="true" /> Sistema de gestión</p><p className="pf-page-title">{titulo}</p></div></div>
        <div className="pf-topbar-account"><span className="pf-topbar-name">{usuario}</span><span className="pf-user-avatar" aria-hidden="true">{iniciales(usuario)}</span></div>
      </header>
      <main id="contenido-principal" className="pf-dashboard-main" tabIndex={-1}>
        <div className="pf-dashboard-content">
          <div className="pf-dashboard-panel">
            {activa === 'inicio' && <Inicio />}
            {activa === 'productos' && <Productos usuarioId={usuarioId} productos={productos} alGuardarProducto={cargarDatos} />}
            {activa === 'ventas' && usuarioId && <PuntoVenta key={usuarioId} usuarioId={usuarioId} productos={productos} alRealizarVenta={cargarDatos} />}
            {activa === 'alertas' && <Alertas usuarioId={usuarioId} productos={productos} alReponerStock={cargarDatos} />}
            {activa === 'historial' && <Historial />}
            {activa === 'reportes' && <Reportes />}
          </div>
        </div>
        <footer className="pf-workspace-footer">© {new Date().getFullYear()} PeruFarma · Sistema de gestión</footer>
      </main>
    </div>
  </div>;
}
