import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './Login.css';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { usuario: usuario.trim(), password });
      sessionStorage.setItem('novaToken', data.token);
      localStorage.removeItem('usuarioLogueado');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar con el servidor. Intenta nuevamente.');
    } finally { setLoading(false); }
  }

  return <main className="pf-login">
    <div className="pf-login-card">
      <section className="pf-login-brand" aria-label="PeruFarma">
        <img src="/perufarma-logo.svg" alt="PeruFarma" className="pf-login-logo" width="840" height="200" fetchPriority="high" />
      </section>
      <section className="pf-login-panel" aria-labelledby="pf-login-title">
        <div className="pf-login-content">
          <header className="pf-login-intro">
            <h1 id="pf-login-title">Bienvenido</h1>
            <p>Ingresa a tu cuenta de PeruFarma.</p>
          </header>
          <form className="pf-login-form" onSubmit={handleLogin} aria-busy={loading}>
            {error && <p id="pf-login-error" role="alert" className="pf-login-error">{error}</p>}
            <div className="pf-login-field">
              <label htmlFor="pf-usuario">Usuario</label>
              <input id="pf-usuario" name="usuario" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Ingresa tu usuario" disabled={loading} aria-describedby={error ? 'pf-login-error' : undefined} />
            </div>
            <div className="pf-login-field">
              <label htmlFor="pf-clave">Clave</label>
              <input id="pf-clave" name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Ingresa tu clave" disabled={loading} aria-describedby={error ? 'pf-login-error' : undefined} />
            </div>
            <button className="pf-login-submit" type="submit" disabled={loading}>{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}</button>
            {loading && <p role="status" className="pf-login-status">El primer acceso puede tardar hasta un minuto si el servidor está iniciando.</p>}
          </form>
          <footer className="pf-login-footer">© {new Date().getFullYear()} PeruFarma · Sistema de gestión</footer>
        </div>
      </section>
    </div>
  </main>;
}
