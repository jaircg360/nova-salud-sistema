import { useState } from 'react';
import axios from '../api';
import { Plus, X, PackagePlus } from 'lucide-react';

export default function Productos({ productos, alGuardarProducto }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState({ nombre: '', precio: '', stock: '', stockMinimo: '10' });

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.post('/productos', nuevoProducto)
      .then(() => {
        setMostrarFormulario(false);
        setNuevoProducto({ nombre: '', precio: '', stock: '', stockMinimo: '10' });
        alGuardarProducto();
      })
      .catch(err => alert(err.response?.data?.error || 'No se pudo guardar el producto'));
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Inventario de Productos</h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona el stock y precios de la botica.</p>
        </div>
        <button 
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
            mostrarFormulario 
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-md'
          }`}
        >
          {mostrarFormulario ? <><X size={18}/> Cancelar</> : <><Plus size={18}/> Nuevo Producto</>}
        </button>
      </div>

      {mostrarFormulario && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 animate-fade-in-down">
          <div className="flex items-center gap-2 mb-4 text-emerald-700 font-semibold">
            <PackagePlus size={20} /> Registrar Nuevo Medicamento
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Producto</label>
              <input type="text" required value={nuevoProducto.nombre} onChange={e => setNuevoProducto({...nuevoProducto, nombre: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-shadow" placeholder="Ej. Panadol 500mg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Precio (S/)</label>
              <input type="number" step="0.01" required value={nuevoProducto.precio} onChange={e => setNuevoProducto({...nuevoProducto, precio: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-shadow" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Inicial</label>
              <input type="number" required value={nuevoProducto.stock} onChange={e => setNuevoProducto({...nuevoProducto, stock: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-shadow" placeholder="0" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Mínimo (Alerta)</label>
              <input type="number" required value={nuevoProducto.stockMinimo} onChange={e => setNuevoProducto({...nuevoProducto, stockMinimo: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-shadow" placeholder="10" />
            </div>
            <div className="md:col-span-2 flex items-end justify-end">
              <button type="submit" className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-colors">
                Guardar en Inventario
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cód.</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Producto</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Precio</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Stock</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {productos.map((prod) => (
              <tr key={prod.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-400 font-mono">#{String(prod.id).padStart(3, '0')}</td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-700">{prod.nombre}</td>
                <td className="px-6 py-4 text-sm text-slate-600">S/ {prod.precio.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-700">{prod.stock} und.</td>
                <td className="px-6 py-4 text-right">
                  {prod.stock <= prod.stockMinimo ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
                      ⚠️ Reponer
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      ✅ Disponible
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}