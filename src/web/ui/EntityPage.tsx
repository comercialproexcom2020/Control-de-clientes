import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

type Field = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'email' | 'select'; required?: boolean; options?: string[]; source?: { url: string; label: string; value: string } };
type Config = { endpoint: string; title: string; description: string; fields: Field[]; columns: { key: string; label: string }[]; filters?: Field[] };
type Datos = Record<string, unknown>;

const configuraciones: Record<string, Config> = {
  clientes: {
    endpoint: '/clientes', title: 'Clientes', description: 'Gestiona los datos y el servidor por defecto de cada cliente.',
    fields: [
      { key: 'nombre', label: 'Nombre del cliente', required: true }, { key: 'responsable_comercial', label: 'Responsable comercial', required: true }, { key: 'nit', label: 'NIT' }, { key: 'contacto', label: 'Persona de contacto' },
      { key: 'telefono', label: 'Teléfono', type: 'text' }, { key: 'email', label: 'Correo electrónico', type: 'email' }, { key: 'ciudad', label: 'Ciudad' },
      { key: 'servidor_id', label: 'Servidor por defecto', type: 'select', source: { url: '/servidores', label: 'nombre', value: 'id' } }, { key: 'activo', label: 'Estado', type: 'select', options: ['Activo','Inactivo'] }, { key: 'notas', label: 'Notas' },
    ], filters: [{ key: 'activo', label: 'Estado', type: 'select', options: ['1','0'] }], columns: [{ key: 'nombre', label: 'Cliente' }, { key: 'responsable_comercial', label: 'Responsable comercial' }, { key: 'contacto', label: 'Contacto' }, { key: 'telefono', label: 'Teléfono' }, { key: 'servidor', label: 'Servidor por defecto' }, { key: 'equipos', label: 'Equipos' }, { key: 'sims', label: 'SIM' }, { key: 'proximo_vencimiento', label: 'Próximo vencimiento' }, { key: 'activo', label: 'Estado' }],
  },
  servidores: {
    endpoint: '/servidores', title: 'Servidores', description: 'Controla los hosts y puertos a los que se conectan los equipos.',
    fields: [{ key: 'nombre', label: 'Nombre', required: true }, { key: 'host', label: 'IP o dominio', required: true }, { key: 'puerto', label: 'Puerto', required: true }, { key: 'plataforma', label: 'Plataforma' }, { key: 'ubicacion', label: 'Proveedor o ubicación' }, { key: 'capacidad', label: 'Capacidad máxima', type: 'number' }, { key: 'activo', label: 'Estado', type: 'select', options: ['Activo','Inactivo'] }, { key: 'notas', label: 'Notas' }],
    filters: [{ key: 'activo', label: 'Estado', type: 'select', options: ['1','0'] }], columns: [{ key: 'nombre', label: 'Servidor' }, { key: 'host', label: 'IP o dominio' }, { key: 'puerto', label: 'Puerto' }, { key: 'plataforma', label: 'Plataforma' }, { key: 'equipos', label: 'Equipos' }, { key: 'clientes', label: 'Clientes' }, { key: 'activo', label: 'Estado' }],
  },
  equipos: {
    endpoint: '/equipos', title: 'Equipos', description: 'Radios asignados a clientes, con servidor individual por equipo.',
    fields: [{ key: 'cliente_id', label: 'Cliente', type: 'select', source: { url: '/clientes', label: 'nombre', value: 'id' } }, { key: 'nombre', label: 'Alias del equipo' }, { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }, { key: 'imei', label: 'IMEI' }, { key: 'serial', label: 'Serial' }, { key: 'estado', label: 'Estado', type: 'select', options: ['Activo','En bodega','Dañado','Reemplazar','Baja'] }, { key: 'servidor_id', label: 'Servidor', type: 'select', source: { url: '/servidores', label: 'nombre', value: 'id' } }, { key: 'fecha_envio', label: 'Fecha de envío', type: 'date' }, { key: 'notas', label: 'Notas' }],
    filters: [{ key: 'estado', label: 'Estado', type: 'select', options: ['Activo','En bodega','Dañado','Reemplazar','Baja'] }, { key: 'servidor_id', label: 'Servidor', type: 'select', source: { url: '/servidores', label: 'nombre', value: 'id' } }], columns: [{ key: 'nombre', label: 'Equipo' }, { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }, { key: 'imei', label: 'IMEI' }, { key: 'estado', label: 'Estado' }, { key: 'cliente', label: 'Cliente' }, { key: 'sim_iccid', label: 'SIM asignada' }, { key: 'servidor', label: 'Servidor' }, { key: 'servidor_host', label: 'IP' }, { key: 'servidor_puerto', label: 'Puerto' }],
  },
  sims: {
    endpoint: '/sims', title: 'SIM cards', description: 'Controla ICCID, operador, estado y asignación de cada SIM.',
    fields: [{ key: 'iccid', label: 'ICCID', required: true }, { key: 'operador', label: 'Operador', type: 'select', options: ['Tigo','Claro','Movistar'] }, { key: 'numero_linea', label: 'Número de línea' }, { key: 'estado', label: 'Estado', type: 'select', options: ['Inventario','En uso','Dañada','Reemplazar','Baja'] }, { key: 'cliente_id', label: 'Cliente', type: 'select', source: { url: '/clientes', label: 'nombre', value: 'id' } }, { key: 'fecha_activacion', label: 'Fecha de activación', type: 'date' }, { key: 'plan_nombre', label: 'Plan de datos' }, { key: 'plan_vence', label: 'Vencimiento del plan', type: 'date' }, { key: 'costo_mensual', label: 'Costo mensual (COP)', type: 'number' }, { key: 'notas', label: 'Notas' }],
    filters: [{ key: 'estado', label: 'Estado', type: 'select', options: ['Inventario','En uso','Dañada','Reemplazar','Baja'] }, { key: 'operador', label: 'Operador', type: 'select', options: ['Tigo','Claro','Movistar'] }], columns: [{ key: 'iccid', label: 'ICCID' }, { key: 'operador', label: 'Operador' }, { key: 'numero_linea', label: 'Línea' }, { key: 'estado', label: 'Estado' }, { key: 'cliente_id', label: 'Cliente' }, { key: 'equipo_id', label: 'Equipo' }, { key: 'plan_vence', label: 'Vence plan' }, { key: 'costo_mensual', label: 'Costo mensual' }],
  },
  licencias: {
    endpoint: '/licencias', title: 'Licencias PoC', description: 'Registra licencias vendidas por cliente. Asociar un equipo o una SIM es opcional.',
    fields: [{ key: 'cliente_id', label: 'Cliente', type: 'select', required: true, source: { url: '/clientes', label: 'nombre', value: 'id' } }, { key: 'proveedor', label: 'Proveedor de licencia', type: 'select', required: true, options: ['Next-PoC','Hytera'] }, { key: 'meses', label: 'Duración (meses)', type: 'select', required: true, options: ['1','3','6','12','24'] }, { key: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true }, { key: 'fecha_vence', label: 'Fecha de vencimiento', type: 'date' }, { key: 'incluye_sim', label: 'Incluye SIM', type: 'select', options: ['No','Sí'] }, { key: 'sim_id', label: 'SIM asociada (opcional)', type: 'select', source: { url: '/sims', label: 'iccid', value: 'id' } }, { key: 'equipo_id', label: 'Equipo asociado (opcional)', type: 'select', source: { url: '/equipos', label: 'nombre', value: 'id' } }, { key: 'precio', label: 'Precio del periodo (COP)', type: 'number' }, { key: 'pagada', label: 'Pago', type: 'select', options: ['Pendiente','Pagada'] }, { key: 'notas', label: 'Notas' }],
    filters: [{ key: 'estado', label: 'Estado', type: 'select', options: ['Activa','Por vencer','Vencida','Anulada'] }], columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'meses', label: 'Duración' }, { key: 'fecha_inicio', label: 'Inicio' }, { key: 'fecha_vence', label: 'Vencimiento' }, { key: 'estado', label: 'Estado' }, { key: 'precio', label: 'Precio' }, { key: 'pagada', label: 'Pago' }],
  },
  bitacora: {
    endpoint: '/bitacora', title: 'Bitácora', description: 'Historial de cambios hechos en el sistema.', fields: [],
    filters: [{ key: 'entidad', label: 'Tipo de registro', type: 'select', options: ['cliente','equipo','sim','licencia','servidor','sistema'] }, { key: 'accion', label: 'Acción', type: 'select', options: ['crear','editar','eliminar','desactivar','renovar','mover','asignar','importar','alta_integral'] }, { key: 'desde', label: 'Desde', type: 'date' }, { key: 'hasta', label: 'Hasta', type: 'date' }],
    columns: [{ key: 'ts', label: 'Fecha y hora' }, { key: 'usuario', label: 'Usuario' }, { key: 'entidad', label: 'Tipo' }, { key: 'cliente', label: 'Cliente' }, { key: 'registro', label: 'Elemento' }, { key: 'accion', label: 'Acción' }, { key: 'detalle', label: 'Detalle' }],
  },
};

export default function EntityPage({ section, rol, initialValues = {}, initialFilters = {}, clearInitial = () => {}, onNavigate = () => {} }: { section: string; rol: string; initialValues?: Record<string, unknown>; initialFilters?: Record<string, string>; clearInitial?: () => void; onNavigate?: (section: string, values?: Record<string, unknown>) => void }) {
  const config = configuraciones[section];
  const [datos, setDatos] = useState<Datos[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState<Record<string, string>>(initialFilters);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Datos | null>(null);
  const [asignacion, setAsignacion] = useState<Datos | null>(null);
  const [simsInventario, setSimsInventario] = useState<Datos[]>([]);
  const [renovando, setRenovando] = useState<Datos | null>(null);
  const [traslado, setTraslado] = useState<Datos | null>(null);
  const [equiposServidor, setEquiposServidor] = useState<Datos[]>([]);
  const [historial, setHistorial] = useState<{ registro: Datos; renovaciones: Datos[] } | null>(null);
  const [fichaCliente, setFichaCliente] = useState<{ cliente: Datos; equipos: Datos[]; sims: Datos[]; licencias: Datos[]; bitacora: Datos[] } | null>(null);
  const [choices, setChoices] = useState<Record<string, Datos[]>>({});
  const [seleccionados, setSeleccionados] = useState<number[]>([]);

  async function cargar() {
    if (!config) return;
    setCargando(true); setError('');
    try {
      const parametros = new URLSearchParams({ q, page: String(pagina) });
      Object.entries(filtros).forEach(([key, value]) => { if (value) parametros.set(key, value); });
      const r = await fetch(`/api${config.endpoint}?${parametros}`);
      const respuesta = await r.json() as { datos?: Datos[]; total?: number; error?: string; detalle?: string };
      if (!r.ok) throw new Error(respuesta.detalle ?? 'No se pudo cargar la lista.');
      setDatos(respuesta.datos ?? []); setTotal(respuesta.total ?? respuesta.datos?.length ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la lista.'); }
    finally { setCargando(false); }
  }

  useEffect(() => { void cargar(); }, [section, q, filtros, pagina]);
  useEffect(() => { setSeleccionados([]); }, [section, q, filtros, pagina, datos]);
  useEffect(() => {
    if (!config) return;
    const urls = [...new Set([...config.fields, ...(config.filters ?? [])].flatMap((f) => f.source ? [f.source.url] : []))];
    void Promise.all(urls.map(async (url) => {
      const r = await fetch(`/api${url}?limit=100`); if (!r.ok) return [url, []] as const;
      const j = await r.json() as { datos?: Datos[] }; return [url, j.datos ?? []] as const;
    })).then((items) => setChoices(Object.fromEntries(items)));
  }, [section]);

  if (!config) return null;

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form); const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const raw = String(fd.get(field.key) ?? '').trim();
      if (raw === '') { if (field.key === 'servidor_id' || field.key === 'cliente_id' || (field.type === 'date' && !(section === 'licencias' && field.key === 'fecha_vence')) || field.type === 'number') payload[field.key] = null; continue; }
      if (field.key === 'incluye_sim') payload[field.key] = raw === 'Sí' ? 1 : 0;
      else if (field.key === 'pagada') payload[field.key] = raw === 'Pagada' ? 1 : 0;
      else if (field.key === 'activo') payload[field.key] = raw === 'Activo' ? 1 : 0;
      else payload[field.key] = field.type === 'number' || field.source || field.key === 'meses' ? Number(raw) : raw;
    }
    const url = `/api${config.endpoint}${editando ? `/${editando.id}` : ''}`;
    const r = await fetch(url, { method: editando ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json() as { mensaje?: string; detalle?: string; aviso?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudo guardar el registro.'); return; }
    setModal(false); setEditando(null); clearInitial(); form.reset(); await cargar(); setError(j.aviso ?? '');
  }

  async function abrirAsignacion(equipo: Datos) {
    const r = await fetch('/api/sims?estado=Inventario&limit=100');
    const j = await r.json() as { datos?: Datos[]; detalle?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudieron cargar las SIM disponibles.'); return; }
    setSimsInventario(j.datos ?? []); setAsignacion(equipo);
  }

  async function abrirTraslado(servidor: Datos) {
    const r = await fetch(`/api/servidores/${servidor.id}/equipos?limit=100`);
    const j = await r.json() as { datos?: Datos[]; detalle?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudieron cargar los equipos.'); return; }
    setEquiposServidor(j.datos ?? []); setTraslado(servidor);
  }

  async function abrirHistorial(licencia: Datos) {
    const r = await fetch(`/api/licencias/${licencia.id}`);
    const j = await r.json() as Datos & { renovaciones?: Datos[]; detalle?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudo cargar el historial.'); return; }
    setHistorial({ registro: j, renovaciones: j.renovaciones ?? [] });
  }

  async function abrirFicha(cliente: Datos) {
    const id = String(cliente.id);
    const respuestas = await Promise.all([
      fetch(`/api/equipos?cliente_id=${id}&limit=100`).then((r) => r.json()) as Promise<{ datos?: Datos[] }>,
      fetch(`/api/sims?cliente_id=${id}&limit=100`).then((r) => r.json()) as Promise<{ datos?: Datos[] }>,
      fetch(`/api/licencias?cliente_id=${id}&limit=100`).then((r) => r.json()) as Promise<{ datos?: Datos[] }>,
      fetch(`/api/clientes/${id}/historial?limit=20`).then((r) => r.json()) as Promise<{ datos?: Datos[] }>,
    ]);
    const [equipos, sims, licencias, bitacora] = respuestas;
    setFichaCliente({ cliente, equipos: equipos.datos ?? [], sims: sims.datos ?? [], licencias: licencias.datos ?? [], bitacora: bitacora.datos ?? [] });
  }

  async function guardarTraslado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!traslado) return;
    const form = new FormData(event.currentTarget);
    const destinoId = Number(form.get('servidor_destino_id'));
    const equipoIds = form.getAll('equipo_ids').map(Number);
    const motivo = String(form.get('motivo') ?? '').trim();
    if (!equipoIds.length || !destinoId || !motivo) { setError('Selecciona equipos, servidor de destino y motivo.'); return; }
    const r = await fetch(`/api/servidores/${traslado.id}/mover-equipos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipo_ids: equipoIds, servidor_destino_id: destinoId, motivo }) });
    const j = await r.json() as { detalle?: string; mensaje?: string; aviso?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudieron mover los equipos.'); return; }
    setTraslado(null); setError(j.aviso ?? ''); await cargar();
  }

  async function guardarAsignacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!asignacion) return;
    const idSim = new FormData(event.currentTarget).get('sim_id');
    const r = await fetch(`/api/equipos/${asignacion.id}/asignar-sim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sim_id: idSim ? Number(idSim) : null }) });
    const j = await r.json() as { detalle?: string; mensaje?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudo asignar la SIM.'); return; }
    setAsignacion(null); setError(''); await cargar();
  }

  async function guardarRenovacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!renovando) return;
    const form = new FormData(event.currentTarget);
    const meses = Number(form.get('meses'));
    const precioCrudo = String(form.get('precio') ?? '').trim();
    const pagada = String(form.get('pagada')) === '1' ? 1 : 0;
    const r = await fetch(`/api/licencias/${renovando.id}/renovar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meses, ...(rol === 'admin' && precioCrudo ? { precio: Number(precioCrudo), pagada } : {}) }) });
    const j = await r.json() as { detalle?: string; mensaje?: string; vence?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudo renovar la licencia.'); return; }
    setRenovando(null); setError(''); await cargar();
  }

  async function eliminarRegistros(ids: number[]) {
    const advertencia = section === 'clientes' ? ' También se borrarán sus equipos, SIM y licencias asociadas.' : section === 'servidores' ? ' Los servidores asociados a equipos o clientes solo se desactivarán.' : '';
    if (!window.confirm(`¿Confirmas eliminar ${ids.length === 1 ? 'este registro' : `estos ${ids.length} registros`} de ${config.title.toLocaleLowerCase('es-CO')}?${advertencia}`)) return;
    const r = await fetch('/api/eliminar-grupo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entidad: section, ids }) });
    const j = await r.json() as { detalle?: string; mensaje?: string; aviso?: string };
    if (!r.ok) { setError(j.detalle ?? 'No se pudo eliminar el registro.'); return; }
    setSeleccionados([]); setError([j.mensaje, j.aviso].filter(Boolean).join(' ')); await cargar();
  }

  function recalcularVencimiento(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    if (section !== 'licencias' || !['fecha_inicio','meses'].includes(event.currentTarget.name)) return;
    const form = event.currentTarget.form;
    const inicio = form?.elements.namedItem('fecha_inicio') as HTMLInputElement | null;
    const duracion = form?.elements.namedItem('meses') as HTMLSelectElement | null;
    const vencimiento = form?.elements.namedItem('fecha_vence') as HTMLInputElement | null;
    if (!inicio?.value || !duracion?.value || !vencimiento) return;
    const [anio, mes, dia] = inicio.value.split('-').map(Number);
    const indiceMes = anio * 12 + mes - 1 + Number(duracion.value);
    const anioDestino = Math.floor(indiceMes / 12); const mesDestino = indiceMes % 12 + 1;
    const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
    vencimiento.value = `${anioDestino}-${String(mesDestino).padStart(2,'0')}-${String(Math.min(dia,ultimoDia)).padStart(2,'0')}`;
  }

  const columnas = config.columns.filter((col) => rol === 'admin' || !['precio','pagada','costo_mensual'].includes(col.key));
  const mostrarAcciones = section === 'clientes' || section === 'licencias' || (rol !== 'lector' && section !== 'bitacora');
  const puedeEliminar = rol === 'admin' && ['clientes','equipos','sims','licencias','servidores'].includes(section);
  const totalColumnas = columnas.length + (mostrarAcciones ? 1 : 0) + (puedeEliminar ? 1 : 0);

  return <section className="entity-page">
    <div className="welcome"><div><div className="eyebrow">GESTIÓN OPERATIVA</div><h1>{config.title}</h1><p>{config.description}</p></div>{section !== 'bitacora' && rol !== 'lector' && <button className="primary" onClick={() => { setEditando(null); setModal(true); }}>＋ <span>Nuevo registro</span></button>}</div>
    <div className="list-toolbar"><label className="search"><span>⌕</span><input aria-label="Buscar" placeholder={`Buscar en ${config.title.toLocaleLowerCase('es-CO')}…`} value={q} onChange={(e) => { setPagina(1); setQ(e.target.value); }} /></label><div className="filter-controls">{config.filters?.map((filter) => filter.type === 'date' ? <label className="date-filter" key={filter.key}><span>{filter.label}</span><input type="date" aria-label={filter.label} value={filtros[filter.key] ?? ''} onChange={(e) => { setPagina(1); setFiltros((actual) => ({ ...actual, [filter.key]: e.target.value })); }} /></label> : <select key={filter.key} aria-label={filter.label} value={filtros[filter.key] ?? ''} onChange={(e) => { setPagina(1); setFiltros((actual) => ({ ...actual, [filter.key]: e.target.value })); }}><option value="">{filter.label}: todos</option>{filter.options?.map((option) => <option key={option} value={option}>{filter.key === 'activo' ? (option === '1' ? 'Activos' : 'Inactivos') : option}</option>)}{filter.source && choices[filter.source.url]?.map((opt) => <option key={String(opt.id)} value={String(opt[filter.source!.value])}>{String(opt[filter.source!.label])}</option>)}</select>)}</div>{puedeEliminar && seleccionados.length > 0 && <button className="delete-action" onClick={() => void eliminarRegistros(seleccionados)}>Eliminar selección ({seleccionados.length})</button>}<span className="record-count">{total} registros</span></div>
    {error && <div className="notice"><span>ⓘ</span><div><b>{error.includes('Access') || error.includes('habilitado') ? 'Acceso pendiente' : 'No se pudo completar'}</b><p>{error}</p></div></div>}
    <div className="table-wrap"><table><thead><tr>{puedeEliminar && <th><input aria-label="Seleccionar todos los registros visibles" type="checkbox" checked={datos.length > 0 && datos.every((row) => seleccionados.includes(Number(row.id)))} onChange={(e) => setSeleccionados(e.target.checked ? datos.map((row) => Number(row.id)) : [])} /></th>}{columnas.map((col) => <th key={col.key}>{col.label}</th>)}{mostrarAcciones && <th>Acciones</th>}</tr></thead><tbody>
      {cargando ? <tr><td colSpan={totalColumnas} className="table-empty">Cargando registros…</td></tr> : datos.length ? datos.map((row, i) => <tr key={String(row.id ?? i)}>{puedeEliminar && <td><input aria-label={`Seleccionar registro ${String(row.id)}`} type="checkbox" checked={seleccionados.includes(Number(row.id))} onChange={(e) => setSeleccionados((actuales) => e.target.checked ? [...actuales, Number(row.id)] : actuales.filter((id) => id !== Number(row.id)))} /></td>}{columnas.map((col) => {
        let value = row[col.key];
        if (col.key === 'cliente_id' && value) value = choices['/clientes']?.find((r) => String(r.id) === String(value))?.nombre ?? value;
        if (col.key === 'servidor_id' && value) value = choices['/servidores']?.find((r) => String(r.id) === String(value))?.nombre ?? value;
        if (col.key === 'activo') value = value === 1 ? 'Activo' : 'Inactivo';
        if (col.key === 'incluye_sim') value = value === 1 ? 'Sí' : 'No';
        if (col.key === 'pagada') value = value === 1 ? 'Pagada' : 'Pendiente';
        if (col.key === 'capacidad' && value !== null && value !== undefined) value = `${String(row.equipos ?? 0)} / ${String(value)}`;
        return <td key={col.key}>{value === null || value === undefined || value === '' ? '—' : String(value)}</td>;
      })}{mostrarAcciones && <td className="row-actions">{section === 'clientes' && <button className="edit-action" onClick={() => void abrirFicha(row)}>Ficha</button>}{section === 'licencias' && <button className="edit-action" onClick={() => void abrirHistorial(row)}>Historial</button>}{rol !== 'lector' && <>{section === 'equipos' && <button className="edit-action" onClick={() => void abrirAsignacion(row)}>SIM</button>}{section === 'licencias' && <button className="edit-action" onClick={() => setRenovando(row)}>Renovar</button>}{section === 'servidores' && <button className="edit-action" onClick={() => void abrirTraslado(row)}>Mover equipos</button>}<button className="edit-action" onClick={() => { setEditando(row); setModal(true); }}>Editar</button></>}</td>}{puedeEliminar && <td><button className="delete-action" onClick={() => void eliminarRegistros([Number(row.id)])}>Eliminar</button></td>}</tr>) : <tr><td colSpan={totalColumnas} className="table-empty"><b>{error ? 'No se pudieron cargar los registros' : 'Aún no hay registros'}</b><span>{error || (section === 'bitacora' ? 'Los movimientos se irán registrando aquí.' : 'Crea el primer registro para comenzar.')}</span></td></tr>}
    </tbody></table></div>
    {total > 25 && <div className="pagination"><button disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>← Anterior</button><span>Página {pagina} de {Math.max(1, Math.ceil(total / 25))}</span><button disabled={pagina >= Math.ceil(total / 25)} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button></div>}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) { setModal(false); setEditando(null); } }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><h2 id="modal-title">{editando ? 'Editar registro' : 'Nuevo registro'}</h2><p>{config.title}</p></div><button className="close" aria-label="Cerrar" onClick={() => { setModal(false); setEditando(null); }}>×</button></div><form onSubmit={(e) => void enviar(e)}><div className="form-grid">{config.fields.filter((f) => !((f.key === 'precio' || f.key === 'pagada' || f.key === 'costo_mensual') && rol !== 'admin')).map((field) => {
      let valor = editando?.[field.key] ?? initialValues[field.key] ?? '';
      if (field.key === 'incluye_sim') valor = valor === 1 ? 'Sí' : 'No';
      if (field.key === 'pagada') valor = valor === 1 ? 'Pagada' : 'Pendiente';
      if (field.key === 'activo') valor = valor === 1 ? 'Activo' : 'Inactivo';
      return <label className={field.key === 'notas' ? 'wide' : ''} key={field.key}><span>{field.label}{field.required && <i> *</i>}</span>
      {field.type === 'select' ? <select name={field.key} required={field.required} defaultValue={String(valor)} onChange={recalcularVencimiento}><option value="">Selecciona…</option>{field.options?.map((opt) => <option value={field.key === 'activo' ? (opt === 'Activo' ? 'Activo' : 'Inactivo') : field.key === 'incluye_sim' ? (opt === 'Sí' ? 'Sí' : 'No') : opt} key={opt}>{opt}</option>)}{field.source && choices[field.source.url]?.filter((opt) => field.source!.url !== '/servidores' || field.key === 'servidor_id' || Number(opt.activo) === 1).map((opt) => <option value={String(opt[field.source!.value])} key={String(opt.id)}>{String(opt[field.source!.label])}</option>)}</select> : field.key === 'notas' ? <textarea name={field.key} rows={3} defaultValue={String(valor)} /> : <input name={field.key} type={field.type ?? 'text'} required={field.required} maxLength={field.type === 'text' ? 255 : undefined} defaultValue={String(valor)} onChange={recalcularVencimiento} />}
    </label>})}</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => { setModal(false); setEditando(null); }}>Cancelar</button><button type="submit" className="primary">{editando ? 'Guardar cambios' : 'Guardar registro'}</button></div></form></div></div>}
    {asignacion && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAsignacion(null); }}><div className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="sim-title"><div className="modal-head"><div><h2 id="sim-title">Asignar SIM</h2><p>{String(asignacion.nombre ?? `Equipo ${asignacion.id}`)}</p></div><button className="close" aria-label="Cerrar" onClick={() => setAsignacion(null)}>×</button></div><form onSubmit={(e) => void guardarAsignacion(e)}><label className="single-field"><span>SIM disponible</span><select name="sim_id" defaultValue=""><option value="">Sin SIM asignada</option>{simsInventario.map((sim) => <option value={String(sim.id)} key={String(sim.id)}>{String(sim.iccid)} · {String(sim.operador ?? 'Operador pendiente')}</option>)}</select></label>{simsInventario.length === 0 && <p className="form-hint">No hay SIM en inventario. Puedes dejar el equipo sin SIM por ahora.</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setAsignacion(null)}>Cancelar</button><button type="submit" className="primary">Guardar asignación</button></div></form></div></div>}
    {renovando && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenovando(null); }}><div className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="renew-title"><div className="modal-head"><div><h2 id="renew-title">Renovar licencia</h2><p>{String(renovando.proveedor ?? 'Proveedor pendiente')} · vence {String(renovando.fecha_vence ?? '')}</p></div><button className="close" aria-label="Cerrar" onClick={() => setRenovando(null)}>×</button></div><form onSubmit={(e) => void guardarRenovacion(e)}><div className="form-grid"><label><span>Duración</span><select name="meses" defaultValue="3">{['1','3','6','12','24'].map((mes) => <option value={mes} key={mes}>{mes} meses</option>)}</select></label>{rol === 'admin' && <><label><span>Precio (COP)</span><input name="precio" type="number" min="0" /></label><label><span>Pago</span><select name="pagada" defaultValue="0"><option value="0">Pendiente</option><option value="1">Pagada</option></select></label></>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setRenovando(null)}>Cancelar</button><button type="submit" className="primary">Confirmar renovación</button></div></form></div></div>}
    {traslado && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setTraslado(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="move-title"><div className="modal-head"><div><h2 id="move-title">Mover equipos</h2><p>Desde {String(traslado.nombre)}</p></div><button className="close" aria-label="Cerrar" onClick={() => setTraslado(null)}>×</button></div><form onSubmit={(e) => void guardarTraslado(e)}><label className="single-field"><span>Servidor de destino</span><select name="servidor_destino_id" required defaultValue=""><option value="">Selecciona…</option>{choices['/servidores']?.filter((s) => Number(s.activo) === 1 && String(s.id) !== String(traslado.id)).map((s) => <option value={String(s.id)} key={String(s.id)}>{String(s.nombre)} — {String(s.host)}:{String(s.puerto)}</option>)}</select></label><span className="field-caption">Selecciona uno o más radios</span><div className="check-list">{equiposServidor.length ? equiposServidor.map((equipo) => <label key={String(equipo.id)}><input type="checkbox" name="equipo_ids" value={String(equipo.id)} /><span>{String(equipo.nombre ?? equipo.imei ?? `Equipo ${equipo.id}`)} <small>{String(equipo.cliente ?? 'Sin cliente')}</small></span></label>) : <p className="form-hint">No hay equipos conectados a este servidor.</p>}</div><label className="single-field"><span>Motivo</span><input name="motivo" required maxLength={500} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setTraslado(null)}>Cancelar</button><button type="submit" className="primary">Mover seleccionados</button></div></form></div></div>}
    {historial && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setHistorial(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="modal-head"><div><h2 id="history-title">Historial de renovaciones</h2><p>{String(historial.registro.proveedor ?? 'Proveedor pendiente')} · vence {String(historial.registro.fecha_vence ?? '')}</p></div><button className="close" aria-label="Cerrar" onClick={() => setHistorial(null)}>×</button></div>{historial.renovaciones.length ? <div className="history-list">{historial.renovaciones.map((ren) => <article key={String(ren.id)}><div><b>{String(ren.fecha)}</b><span>{String(ren.meses)} meses · {String(ren.desde)} → {String(ren.vence)}</span></div>{rol === 'admin' && <strong>{ren.precio == null ? '—' : `$ ${Number(ren.precio).toLocaleString('es-CO')}`} · {ren.pagada === 1 ? 'Pagada' : 'Pendiente'}</strong>}</article>)}</div> : <div className="empty history-empty"><span className="empty-icon">◷</span><b>Aún no hay renovaciones</b><p>Las renovaciones futuras quedarán registradas aquí.</p></div>}<div className="modal-actions"><button type="button" className="primary" onClick={() => setHistorial(null)}>Cerrar</button></div></div></div>}
    {fichaCliente && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setFichaCliente(null); }}><div className="modal customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-title"><div className="modal-head"><div><h2 id="customer-title">{String(fichaCliente.cliente.nombre)}</h2><p>{String(fichaCliente.cliente.contacto ?? 'Sin contacto')} · {String(fichaCliente.cliente.telefono ?? 'Sin teléfono')} · {String(fichaCliente.cliente.ciudad ?? '')}</p></div><button className="close" aria-label="Cerrar" onClick={() => setFichaCliente(null)}>×</button></div>{rol !== 'lector' && <div className="quick-actions"><button onClick={() => onNavigate('servicios', { cliente_id: fichaCliente.cliente.id })}>＋ Agregar equipo, SIM o licencia</button></div>}<div className="customer-sections"><section><h3>Equipos <span>{fichaCliente.equipos.length}</span></h3>{fichaCliente.equipos.length ? fichaCliente.equipos.map((equipo) => <div className="customer-row" key={String(equipo.id)}><b>{String(equipo.nombre ?? equipo.modelo ?? `Equipo ${equipo.id}`)}</b><span>{String(equipo.estado)} · SIM {String(equipo.sim_iccid ?? 'sin asignar')} · {String(equipo.servidor ?? 'sin servidor')} {equipo.servidor_host ? `(${String(equipo.servidor_host)}:${String(equipo.servidor_puerto)})` : ''}</span></div>) : <p className="form-hint">Sin equipos registrados.</p>}</section><section><h3>SIM cards <span>{fichaCliente.sims.length}</span></h3>{fichaCliente.sims.length ? fichaCliente.sims.map((sim) => <div className="customer-row" key={String(sim.id)}><b>{String(sim.iccid)}</b><span>{String(sim.operador ?? 'Operador pendiente')} · {String(sim.estado)}</span></div>) : <p className="form-hint">Sin SIM registradas.</p>}</section><section><h3>Licencias <span>{fichaCliente.licencias.length}</span></h3>{fichaCliente.licencias.length ? fichaCliente.licencias.map((licencia) => <div className="customer-row" key={String(licencia.id)}><b>{String(licencia.proveedor ?? 'Proveedor pendiente')} · {String(licencia.estado)}</b><span>{String(licencia.meses)} meses · vence {String(licencia.fecha_vence)}{rol === 'admin' && licencia.precio != null ? ` · $ ${Number(licencia.precio).toLocaleString('es-CO')}` : ''}</span></div>) : <p className="form-hint">Sin licencias registradas.</p>}</section><section><h3>Historial <span>{fichaCliente.bitacora.length}</span></h3>{fichaCliente.bitacora.length ? fichaCliente.bitacora.map((mov) => <div className="customer-row" key={String(mov.id)}><b>{String(mov.accion)} · {String(mov.ts)}</b><span>{String(mov.detalle)}</span></div>) : <p className="form-hint">Sin movimientos registrados.</p>}</section></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setFichaCliente(null)}>Cerrar</button></div></div></div>}
  </section>;
}
