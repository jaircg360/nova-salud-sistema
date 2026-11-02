import api from '../api';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Activity } from 'lucide-react';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { usuario, password });
      sessionStorage.setItem('novaToken', data.token);
      localStorage.removeItem('usuarioLogueado');
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err.response?.data?.error || 'No se pudo conectar con el servidor'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-100 to-teal-100 p-4">
      {/* Tarjeta del Login */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/50 backdrop-blur-sm">

        {/* Cabecera de la tarjeta con color */}
        <div className="bg-emerald-600 p-8 text-center relative overflow-hidden">
          {/* Adorno de fondo */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500 rounded-full opacity-50 blur-2xl"></div>
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-700 rounded-full opacity-50 blur-2xl"></div>

          <div className="relative z-10 flex flex-col items-center">
            <div className="bg-white p-3 rounded-2xl shadow-lg mb-4">
              <Activity size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Nova Salud</h2>
            <p className="text-emerald-100 text-sm mt-2 font-medium">Sistema de Inventario y Ventas</p>
          </div>
        </div>

        {/* Formulario */}
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Usuario</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-400" />
                </div>
                <input
                  type="text" required autoComplete="username" maxLength={80}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-800 transition-all placeholder:text-slate-400"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ej. Maria Torres"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-400" />
                </div>
                <input
                  type="password" required autoComplete="current-password" maxLength={128}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-800 transition-all placeholder:text-slate-400"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex justify-center items-center gap-2 group"
            >
              {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            {loading && <p role="status" className="text-sm text-slate-500">El primer acceso puede tardar hasta un minuto si el servidor está iniciando.</p>}
          </form>

          {/* Footer de la tarjeta */}
          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <p className="text-xs text-slate-400 font-medium">
              &copy; {new Date().getFullYear()} Botica Nova Salud. <br/> Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}