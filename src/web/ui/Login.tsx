import { useState } from 'react';
import type { FormEvent } from 'react';
import './login.css';

export type UsuarioActivo = { email: string; rol: string };

export default function Login({ onLogin }: { onLogin: (usuario: UsuarioActivo) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const datos = await respuesta.json().catch(() => null) as { usuario?: UsuarioActivo; detalle?: string } | null;
      if (!respuesta.ok || !datos?.usuario) throw new Error(datos?.detalle ?? 'No fue posible conectar con el servidor o validar el acceso.');
      onLogin(datos.usuario);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  return <main className="login-shell">
    <section className="login-card" aria-labelledby="titulo-login">
      <div className="login-brand"><span className="brand-mark">C</span><span>CONTROL PERSONAL<small>GESTIÓN DE CLIENTES</small></span></div>
      <h1 id="titulo-login">Iniciar sesión</h1>
      <p>Ingresa con el correo habilitado para Control de clientes.</p>
      <form onSubmit={entrar}>
        <label htmlFor="login-email">Correo electrónico</label>
        <input id="login-email" name="email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password">Contraseña</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" minLength={16} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary login-submit" type="submit" disabled={enviando}>{enviando ? 'Validando…' : 'Entrar'}</button>
      </form>
      <small className="login-help">Si todavía no tienes contraseña, solicita al administrador que configure tu acceso.</small>
    </section>
  </main>;
}
