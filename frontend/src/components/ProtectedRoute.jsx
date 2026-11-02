import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api';
export default function ProtectedRoute({ children }) {
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/auth/me').then(() => { if (active) setState('ok'); }).catch(error => { if (active) setState(error.response?.status === 401 ? 'unauthorized' : 'error'); });
    return () => { active = false; };
  }, [attempt]);
  if (!sessionStorage.getItem('novaToken') || state === 'unauthorized') return <Navigate to="/" replace />;
  if (state === 'error') return <div className="p-8 text-center" role="alert">No se pudo conectar con el servidor. <button onClick={() => { setState('loading'); setAttempt(attempt+1); }}>Reintentar</button></div>;
  if (state === 'loading') return <p className="p-8 text-center">Verificando sesión...</p>;
  return children;
}
