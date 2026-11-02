import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, AlertTriangle, History, LogOut, Hexagon, LayoutDashboard, FileBarChart } from 'lucide-react';
import axios from '../api';

// Importamos los componentes
import Inicio from '../components/Inicio';
import Productos from '../components/Productos';
import Alertas from '../components/Alertas';
import PuntoVenta from '../components/PuntoVenta';
import Historial from '../components/Historial';
import Reportes from '../components/Reportes';

export default function Dashboard() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState(null);
  
  // CAMBIO: Ahora inicia en 'inicio' por defecto
  const [pestañaActiva, setPestañaActiva] = useState('inicio');
  const [productos, setProductos] = useState([]);
  const [cantidadAlertas, setCantidadAlertas] = useState(0);

  const cargarDatos = () => {
    return axios.get('/productos')
      .then(res => {
        setProductos(res.data);
        setCantidadAlertas(res.data.filter(p => p.stock <= p.stockMinimo).length);
      })
      .catch(err => console.error("Error al obtener productos", err));
  };

  useEffect(() => { cargarDatos(); axios.get('/auth/me').then(res => { setUsuario(res.data.nombre); setUsuarioId(res.data.id); }).catch(() => {}); }, []);

  const cerrarSesion = async () => {
    try { await axios.post('/auth/logout'); }
    catch { alert('No se pudo cerrar la sesión. Reintenta cuando se restablezca la conexión.'); return; }
    sessionStorage.removeItem('novaToken');
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Barra Superior */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 p-1.5 rounded-lg">
              <Hexagon size={20} className="text-white fill-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Nova Salud</h1>
            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full border border-emerald-100">
              Sistema de Ventas
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-slate-900">{usuario}</span>
              <span className="text-xs text-slate-500">Vendedor</span>
            </div>
            <button onClick={cerrarSesion} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg" title="Cerrar Sesión">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Pestañas (Tabs) */}
        <div className="flex flex-wrap gap-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-fit">
          
          {/* NUEVA PESTAÑA DE INICIO */}
          <TabButton icon={<LayoutDashboard size={16}/>} label="Inicio" active={pestañaActiva === 'inicio'} onClick={() => setPestañaActiva('inicio')} />
          
          <TabButton icon={<Package size={16}/>} label="Inventario" active={pestañaActiva === 'productos'} onClick={() => setPestañaActiva('productos')} />
          
          <TabButton icon={<ShoppingCart size={16}/>} label="Punto de Venta" active={pestañaActiva === 'ventas'} onClick={() => setPestañaActiva('ventas')} />
          
          <TabButton 
            icon={<AlertTriangle size={16}/>} 
            label={`Alertas ${cantidadAlertas > 0 ? `(${cantidadAlertas})` : ''}`} 
            active={pestañaActiva === 'alertas'} 
            onClick={() => setPestañaActiva('alertas')} 
            alerta={cantidadAlertas > 0}
          />
          
          <TabButton icon={<History size={16}/>} label="Historial" active={pestañaActiva === 'historial'} onClick={() => setPestañaActiva('historial')} />
          <TabButton icon={<FileBarChart size={16}/>} label="Reportes" active={pestañaActiva === 'reportes'} onClick={() => setPestañaActiva('reportes')} />
        </div>

        {/* Panel de contenido */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
          <div className="p-6">
            {/* NUEVO COMPONENTE INICIO */}
            {pestañaActiva === 'inicio' && <Inicio />}
            
            {pestañaActiva === 'productos' && <Productos productos={productos} alGuardarProducto={cargarDatos} />}
            
            {pestañaActiva === 'ventas' && usuarioId && <PuntoVenta key={usuarioId} usuarioId={usuarioId} productos={productos} alRealizarVenta={cargarDatos} />}
            
            {/* ACTUALIZADO: Le pasamos la función alReponerStock a Alertas */}
            {pestañaActiva === 'alertas' && <Alertas productos={productos} alReponerStock={cargarDatos} />}
            
            {pestañaActiva === 'historial' && <Historial />}
            {pestañaActiva === 'reportes' && <Reportes />}
          </div>
        </div>
      </main>
    </div>
  );
}

function TabButton({ icon, label, active, onClick, alerta }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active 
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
      }`}
    >
      <span className={active ? 'text-emerald-600' : (alerta ? 'text-amber-500' : 'text-slate-400')}>
        {icon}
      </span>
      {label}
    </button>
  );
}