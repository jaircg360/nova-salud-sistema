import { AlertTriangle, PlusCircle, CheckCircle2 } from 'lucide-react';
import axios from '../api';

export default function Alertas({ productos, alReponerStock }) {
  const alertas = productos.filter(p => p.stock <= p.stockMinimo);

  const handleReponer = (id, nombre) => {
    const cantidad = window.prompt(`¿Cuántas unidades nuevas ingresaron de: ${nombre}?`);
    
    if (cantidad && !isNaN(cantidad) && parseInt(cantidad) > 0) {
      axios.put(`/productos/${id}/reponer`, { cantidad: parseInt(cantidad) })
        .then(() => {
          alReponerStock();
        })
        .catch(err => alert(err.response?.data?.error || 'Error al reponer stock'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <AlertTriangle size={24} className="text-amber-500" />
        <h2 className="text-xl font-bold text-slate-900">Alertas de Reposición</h2>
      </div>
      
      {alertas.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-xl flex flex-col items-center justify-center text-center">
          <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
          <p className="text-emerald-800 font-bold text-lg">Todo en orden</p>
          <p className="text-emerald-600 text-sm mt-1">No hay productos con bajo stock en este momento.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {alertas.map((prod) => (
            <div key={prod.id} className="bg-white border border-amber-200 p-5 rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <p className="font-bold text-slate-800">{prod.nombre}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <p className="text-slate-500">Stock actual: <span className="font-bold text-red-600">{prod.stock}</span></p>
                  <p className="text-slate-500">Mínimo requerido: <span className="font-bold text-slate-700">{prod.stockMinimo}</span></p>
                </div>
              </div>
              <button 
                onClick={() => handleReponer(prod.id, prod.nombre)}
                className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <PlusCircle size={16} /> Reponer Stock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}