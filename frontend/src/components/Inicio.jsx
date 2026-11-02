import { useEffect, useState } from 'react';
import axios from '../api';
import { DollarSign, Package, AlertTriangle, TrendingUp, CalendarDays, Lightbulb } from 'lucide-react';

export default function Inicio() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get('/estadisticas')
      .then(res => setStats(res.data))
      .catch(err => console.error(err));
  }, []);

  if (!stats) return <p className="text-slate-500">Cargando estadísticas...</p>;

  // Obtener la fecha actual formateada (ej. "22 de Octubre, 2026")
  const opcionesFecha = { year: 'numeric', month: 'long', day: 'numeric' };
  const fechaHoy = new Date().toLocaleDateString('es-ES', opcionesFecha);
  const fechaCapitalizada = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1);

  return (
    <div className="animate-fade-in">
      
      {/* Título con la fecha */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-slate-900">Resumen del Día</h2>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
          <CalendarDays size={14} /> {fechaCapitalizada}
        </span>
      </div>
      
      {/* Las 4 Tarjetas */}
      <div className="pf-home-metrics grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Tarjeta 1 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-100 p-3 rounded-xl">
            <DollarSign size={24} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Ingresos Totales</p>
            <p className="text-2xl font-bold text-slate-800">S/ {stats.totalVentasHoy}</p>
          </div>
        </div>

        {/* Tarjeta 2 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-xl">
            <Package size={24} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Productos Totales</p>
            <p className="text-2xl font-bold text-slate-800">{stats.cantidadProductos}</p>
          </div>
        </div>

        {/* Tarjeta 3 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-100 p-3 rounded-xl">
            <AlertTriangle size={24} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Alertas Críticas</p>
            <p className="text-2xl font-bold text-slate-800">{stats.alertasCriticas}</p>
          </div>
        </div>

        {/* Tarjeta 4 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-xl shrink-0">
            <TrendingUp size={24} className="text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Más Vendido</p>
            <p className="text-sm font-bold text-slate-800 break-words max-w-32" title={stats.masVendido}>{stats.masVendido}</p>
          </div>
        </div>
      </div>

      {/* Tarjeta de Bienvenida / Tip */}
      <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-md flex items-start sm:items-center gap-4 relative overflow-hidden">
        {/* Adorno de fondo */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500 rounded-full opacity-50 blur-2xl pointer-events-none"></div>
        
        <div className="bg-white/20 p-3 rounded-full shrink-0">
          <Lightbulb size={24} className="text-white" />
        </div>
        <div className="relative z-10">
          <h3 className="text-lg font-bold mb-1">¡Bienvenido al sistema!</h3>
          <p className="text-emerald-50 text-sm">
            Recuerda revisar el apartado de <strong>Alertas</strong> antes de cerrar el turno para asegurar que no falte ningún medicamento esencial en el inventario.
          </p>
        </div>
      </div>

    </div>
  );
}