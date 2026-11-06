import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import EntityPage from './EntityPage';
import Login from './Login';
import type { UsuarioActivo } from './Login';

type Resumen = Record<string, number>;
const tarjetas = [
  ['Clientes', 'clientes', '◉'], ['Licencias por vencer', 'licencias_por_vencer', '◷'],
  ['Licencias vencidas', 'licencias_vencidas', '⌛'], ['SIM en inventario', 'sims_inventario', '▤'],
  ['SIM en uso', 'sims_en_uso', '▣'], ['SIM dañadas', 'sims_danadas', '△'],
  ['Por reemplazar', 'sims_reemplazar', '↻'],
];

export default function App() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [usuario, setUsuario] = useState<UsuarioActivo | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [seccion, setSeccion] = useState('inicio');
  const [rol, setRol] = useState('lector');
  const [valoresIniciales, setValoresIniciales] = useState<Record<string, unknown>>({});
  const [filtrosIniciales, setFiltrosIniciales] = useState<Record<string, string>>({});
  useEffect(() => {
    let activo = true;
    fetch('/api/sesion').then(async (respuesta) => {
      if (respuesta.status === 401) return null;
      if (!respuesta.ok) throw new Error('No fue posible validar la sesión.');
      return (await respuesta.json() as { usuario: UsuarioActivo }).usuario;
    }).then(async (actual) => {
      if (!activo) return;
      setUsuario(actual);
      if (!actual) return;
      setRol(actual.rol);
      const respuesta = await fetch('/api/resumen');
      if (!respuesta.ok) throw new Error(respuesta.status === 401 ? 'La sesión venció. Inicia sesión nuevamente.' : 'No fue posible cargar el resumen.');
      setResumen(await respuesta.json() as Resumen);
    }).catch((e: Error) => { if (activo) setError(e.message); }).finally(() => { if (activo) setCargandoSesion(false); });
    return () => { activo = false; };
  }, []);

  if (cargandoSesion) return <main className="login-shell"><p role="status">Cargando sesión…</p></main>;
  if (!usuario) return <Login onLogin={(actual) => { setUsuario(actual); setRol(actual.rol); setError(''); fetch('/api/resumen').then(async (respuesta) => { if (!respuesta.ok) throw new Error('No fue posible cargar el resumen.'); setResumen(await respuesta.json() as Resumen); }).catch((e: Error) => setError(e.message)); }} />;

  async function salir() {
    await fetch('/api/sesion', { method: 'DELETE' }).catch(() => undefined);
    setUsuario(null);
    setResumen(null);
    setError('');
  }

  const fechaHoy = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date()).toLocaleUpperCase('es-CO');
  const etiquetas: Record<string, string> = { inicio: 'Inicio', clientes: 'Clientes', equipos: 'Equipos', sims: 'SIM cards', licencias: 'Licencias', servidores: 'Servidores', bitacora: 'Bitácora' };
  function navegar(event: MouseEvent<HTMLAnchorElement>, pagina: string) { event.preventDefault(); setValoresIniciales({}); setFiltrosIniciales({}); setSeccion(pagina); }
  function abrirPagina(pagina: string, valores: Record<string, unknown> = {}) { setValoresIniciales(valores); setFiltrosIniciales({}); setSeccion(pagina); }
  function abrirIndicador(clave: string) {
    if (clave.startsWith('licencias')) { setFiltrosIniciales({ estado: clave === 'licencias_vencidas' ? 'Vencida' : 'Por vencer' }); setSeccion('licencias'); }
    else if (clave.startsWith('sims')) { setFiltrosIniciales({ estado: clave === 'sims_danadas' ? 'Dañada' : clave === 'sims_reemplazar' ? 'Reemplazar' : clave === 'sims_en_uso' ? 'En uso' : 'Inventario' }); setSeccion('sims'); }
    else { setFiltrosIniciales({ activo: '1' }); setSeccion('clientes'); }
  }
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">P</span><span>PROEXCOM<small>CONTROL OPERATIVO</small></span></div>
      <nav aria-label="Navegación principal">
        <a onClick={(e) => navegar(e, 'inicio')} className={`nav-item ${seccion === 'inicio' ? 'active' : ''}`} href="#inicio"><span>⌂</span>Inicio</a>
        <a onClick={(e) => navegar(e, 'clientes')} className={`nav-item ${seccion === 'clientes' ? 'active' : ''}`} href="#clientes"><span>◉</span>Clientes</a>
        <a onClick={(e) => navegar(e, 'equipos')} className={`nav-item ${seccion === 'equipos' ? 'active' : ''}`} href="#equipos"><span>▣</span>Equipos</a>
        <a onClick={(e) => navegar(e, 'sims')} className={`nav-item ${seccion === 'sims' ? 'active' : ''}`} href="#sims"><span>▤</span>SIM cards</a>
        <a onClick={(e) => navegar(e, 'licencias')} className={`nav-item ${seccion === 'licencias' ? 'active' : ''}`} href="#licencias"><span>◷</span>Licencias</a>
        <a onClick={(e) => navegar(e, 'servidores')} className={`nav-item ${seccion === 'servidores' ? 'active' : ''}`} href="#servidores"><span>⌘</span>Servidores</a>
        <a onClick={(e) => navegar(e, 'bitacora')} className={`nav-item ${seccion === 'bitacora' ? 'active' : ''}`} href="#bitacora"><span>≡</span>Bitácora</a>
      </nav>
      <div className="sidebar-bottom"><span className="avatar">{usuario.email.slice(0, 2).toUpperCase()}</span><span>{usuario.email}<small>{usuario.rol}</small></span><button className="logout-small" onClick={salir}>Salir</button></div>
    </aside>
    <main className="main" id="inicio">
      <header className="topbar"><div className="crumb">Espacio de trabajo <span>/</span> <b>{etiquetas[seccion]}</b></div><div className="top-actions"><button aria-label="Buscar">⌕</button><button aria-label="Notificaciones">♧</button><button className="logout-button" onClick={salir}>Cerrar sesión</button></div></header>
      <section className="content">
        {seccion !== 'inicio' ? <EntityPage key={seccion} section={seccion} rol={rol} initialValues={valoresIniciales} initialFilters={filtrosIniciales} clearInitial={() => setValoresIniciales({})} onNavigate={abrirPagina} /> : <>
        <div className="welcome"><div><div className="eyebrow">{fechaHoy}</div><h1>Resumen general</h1><p>El estado de tu operación, en un solo lugar.</p></div><button className="primary">＋ <span>Nuevo registro</span></button></div>
        {error && <div className="notice" role="alert"><span>ⓘ</span><div><b>No se pudo cargar la información</b><p>{error}</p></div></div>}
        <div className="section-head"><div><h2>Vista rápida</h2><span>Indicadores de tu operación</span></div><button className="range">Últimos 30 días <span>⌄</span></button></div>
        <div className="cards">{tarjetas.map(([label, key, icon], i) => <article className={`stat-card card-${i} clickable`} key={key} role="button" tabIndex={0} onClick={() => abrirIndicador(key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') abrirIndicador(key); }}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{resumen?.[key] ?? '—'}</strong><div className="stat-foot">{resumen ? 'Ver registros' : 'Esperando conexión'}</div></article>)}</div>
        <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Próximos vencimientos</h2><span>Licencias que requieren seguimiento</span></div><a href="#licencias">Ver todas <span>→</span></a></div><div className="empty"><span className="empty-icon">◷</span><b>Tu lista aparecerá aquí</b><p>Agrega clientes y licencias para llevar el control de renovaciones.</p></div></section><section className="panel activity"><div className="panel-head"><div><h2>Actividad reciente</h2><span>Últimos movimientos registrados</span></div><a href="#bitacora">Bitácora <span>→</span></a></div><div className="empty"><span className="empty-icon">≡</span><b>Aún no hay movimientos</b><p>Los cambios de tu equipo quedarán registrados aquí.</p></div></section></div>
        <footer>Control de clientes <span>·</span> PROEXCOM</footer>
        </>}
      </section>
    </main>
  </div>;
}
