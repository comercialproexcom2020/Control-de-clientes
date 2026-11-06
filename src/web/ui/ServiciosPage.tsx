import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Datos = Record<string, unknown>;
type RespuestaLista = { datos?: Datos[]; error?: string; detalle?: string };

async function pedir<T extends Datos = Datos>(url: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
  const respuesta = await fetch(`/api${url}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const datos = await respuesta.json() as T & { detalle?: string; error?: string };
  if (!respuesta.ok) throw new Error(datos.detalle ?? datos.error ?? 'No se pudo guardar la información.');
  return datos;
}

function valor(form: FormData, clave: string) { return String(form.get(clave) ?? '').trim(); }
function textoOCero(value: string) { return value || null; }

export default function ServiciosPage({ rol, initialValues = {}, clearInitial = () => {} }: { rol: string; initialValues?: Record<string, unknown>; clearInitial?: () => void }) {
  const [clientes, setClientes] = useState<Datos[]>([]);
  const [equipos, setEquipos] = useState<Datos[]>([]);
  const [sims, setSims] = useState<Datos[]>([]);
  const [servidores, setServidores] = useState<Datos[]>([]);
  const [modoCliente, setModoCliente] = useState<'nuevo' | 'existente'>('nuevo');
  const [clienteId, setClienteId] = useState('');
  const [agregarEquipo, setAgregarEquipo] = useState(false);
  const [agregarSim, setAgregarSim] = useState(false);
  const [modoSim, setModoSim] = useState<'nueva' | 'existente'>('nueva');
  const [agregarLicencia, setAgregarLicencia] = useState(false);
  const [equipoNuevoId, setEquipoNuevoId] = useState<number | null>(null);
  const [simNuevaId, setSimNuevaId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function cargarClientes() {
    const r = await pedir<RespuestaLista>('/clientes?activo=1&limit=100');
    setClientes(r.datos ?? []);
  }
  async function cargarServidores() {
    const r = await pedir<RespuestaLista>('/servidores?limit=100');
    setServidores(r.datos ?? []);
  }
  async function cargarRecursosCliente(id: string) {
    if (!id) { setEquipos([]); setSims([]); return; }
    const [e, s] = await Promise.all([
      pedir<RespuestaLista>(`/equipos?cliente_id=${id}&limit=100`),
      pedir<RespuestaLista>(`/sims?cliente_id=${id}&limit=100`),
    ]);
    setEquipos(e.datos ?? []); setSims(s.datos ?? []);
  }

  useEffect(() => { void Promise.all([cargarClientes(), cargarServidores()]).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => { void cargarRecursosCliente(clienteId).catch((e: Error) => setError(e.message)); }, [clienteId]);
  useEffect(() => {
    const id = initialValues.cliente_id;
    if (id !== undefined && id !== null) { setModoCliente('existente'); setClienteId(String(id)); clearInitial(); }
  }, [initialValues, clearInitial]);

  async function buscarOCrearServidor(form: FormData): Promise<number | null> {
    const host = valor(form, 'servidor_host');
    const puerto = valor(form, 'servidor_puerto');
    if (!host && !puerto) return null;
    if (!host || !puerto) throw new Error('Para guardar el servidor indica IP/dominio y puerto.');
    const encontrados = await pedir<RespuestaLista>(`/servidores?q=${encodeURIComponent(host)}&limit=100`);
    const coincidencia = [...(encontrados.datos ?? []), ...servidores].find((s) => String(s.host).toLowerCase() === host.toLowerCase() && String(s.puerto) === puerto);
    if (coincidencia && Number(coincidencia.activo) !== 1) throw new Error('Ese servidor ya existe, pero está inactivo. Actívalo antes de asignarlo al equipo.');
    const existente = coincidencia;
    if (existente) return Number(existente.id);
    const creado = await pedir<{ id: number }>('/servidores', 'POST', {
      nombre: valor(form, 'servidor_nombre') || `${host}:${puerto}`, host, puerto,
      plataforma: textoOCero(valor(form, 'servidor_plataforma')),
      ubicacion: textoOCero(valor(form, 'servidor_ubicacion')),
    });
    setServidores((actuales) => [...actuales, { id: creado.id, host, puerto, nombre: valor(form, 'servidor_nombre') || `${host}:${puerto}`, activo: 1 }]);
    return Number(creado.id);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGuardando(true); setError(''); setMensaje('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let idCliente = modoCliente === 'existente' ? Number(clienteId) : 0;
    let idEquipoNuevo = equipoNuevoId;
    let idSimNueva = simNuevaId;
    let nombreCliente = clientes.find((c) => Number(c.id) === idCliente)?.nombre;
    const completado: string[] = [];
    try {
      if (modoCliente === 'existente' && !idCliente) throw new Error('Selecciona el cliente al que vas a agregar información.');
      if (modoCliente === 'existente' && !agregarEquipo && !agregarSim && !agregarLicencia) throw new Error('Marca si vas a agregar un equipo, una SIM o una licencia.');
      if (agregarEquipo && !valor(form, 'imei') && !valor(form, 'serial') && !valor(form, 'equipo_nombre')) throw new Error('Para agregar un equipo, ingresa al menos IMEI, serial o alias.');
      if (agregarEquipo && Boolean(valor(form, 'servidor_host')) !== Boolean(valor(form, 'servidor_puerto'))) throw new Error('Para guardar el servidor indica IP/dominio y puerto.');
      if (agregarSim && modoSim === 'nueva' && valor(form, 'iccid').length < 5) throw new Error('Para agregar una SIM, ingresa un ICCID válido.');
      if (agregarEquipo && valor(form, 'imei')) {
        const existentes = await pedir<RespuestaLista>(`/equipos?q=${encodeURIComponent(valor(form, 'imei'))}&limit=100`);
        if (existentes.datos?.some((x) => String(x.imei) === valor(form, 'imei'))) throw new Error('Ya hay un equipo registrado con ese IMEI. Revisa el cliente o usa la vista detallada para reasignarlo.');
      }
      if (agregarSim && modoSim === 'nueva') {
        const existentes = await pedir<RespuestaLista>(`/sims?q=${encodeURIComponent(valor(form, 'iccid'))}&limit=100`);
        if (existentes.datos?.some((x) => String(x.iccid) === valor(form, 'iccid'))) throw new Error('Ya hay una SIM registrada con ese ICCID. Selecciónala en la lista de SIM existentes si deseas asociarla.');
      }
      if (agregarEquipo && valor(form, 'servidor_host') && valor(form, 'servidor_puerto')) {
        const encontrados = await pedir<RespuestaLista>(`/servidores?q=${encodeURIComponent(valor(form, 'servidor_host'))}&limit=100`);
        const existente = encontrados.datos?.find((s) => String(s.host).toLowerCase() === valor(form, 'servidor_host').toLowerCase() && String(s.puerto) === valor(form, 'servidor_puerto'));
        if (existente && Number(existente.activo) !== 1) throw new Error('Ese servidor ya existe, pero está inactivo. Actívalo antes de asignarlo al equipo.');
      }
      if (modoCliente === 'nuevo') {
        const creado = await pedir<{ id: number }>('/clientes', 'POST', {
          nombre: valor(form, 'cliente_nombre'), responsable_comercial: valor(form, 'responsable_comercial'),
          nit: textoOCero(valor(form, 'nit')), contacto: textoOCero(valor(form, 'contacto')),
          telefono: textoOCero(valor(form, 'telefono')), email: textoOCero(valor(form, 'email')),
          ciudad: textoOCero(valor(form, 'ciudad')), direccion: textoOCero(valor(form, 'direccion')),
        });
        idCliente = Number(creado.id); nombreCliente = valor(form, 'cliente_nombre');
        setModoCliente('existente'); setClienteId(String(idCliente)); completado.push('cliente');
      }

      if (agregarEquipo) {
        const imei = valor(form, 'imei'); const serial = valor(form, 'serial'); const alias = valor(form, 'equipo_nombre');
        const servidorId = await buscarOCrearServidor(form);
        const equipo = await pedir<{ id: number }>('/equipos', 'POST', {
          cliente_id: idCliente, nombre: textoOCero(alias), marca: textoOCero(valor(form, 'marca')),
          modelo: textoOCero(valor(form, 'modelo')), imei: textoOCero(imei), serial: textoOCero(serial),
          estado: agregarSim && valor(form, 'sim_equipo') ? 'Activo' : 'En bodega', servidor_id: servidorId, fecha_envio: textoOCero(valor(form, 'fecha_envio')),
          notas: textoOCero(valor(form, 'notas_equipo')),
        });
        idEquipoNuevo = Number(equipo.id); setEquipoNuevoId(idEquipoNuevo); setAgregarEquipo(false); completado.push('equipo');
      }

      if (agregarSim) {
        let simId: number;
        if (modoSim === 'existente') {
          simId = Number(valor(form, 'sim_existente_id'));
          if (!simId) throw new Error('Selecciona la SIM registrada que quieres usar.');
          idSimNueva = simId; setSimNuevaId(simId); setAgregarSim(false); completado.push('SIM existente');
        } else {
          const iccid = valor(form, 'iccid');
          const sim = await pedir<{ id: number }>('/sims', 'POST', {
            iccid, operador: textoOCero(valor(form, 'operador')), numero_linea: textoOCero(valor(form, 'numero_linea')),
            estado: 'Inventario', cliente_id: idCliente, fecha_activacion: textoOCero(valor(form, 'fecha_activacion')),
            plan_nombre: textoOCero(valor(form, 'plan_nombre')), plan_vence: textoOCero(valor(form, 'plan_vence')),
          });
          simId = Number(sim.id); idSimNueva = simId; setSimNuevaId(simId); setAgregarSim(false); completado.push('SIM');
        }
        const relacionEquipo = valor(form, 'sim_equipo');
        const equipoId = relacionEquipo === 'nuevo' ? idEquipoNuevo : relacionEquipo ? Number(relacionEquipo) : null;
        if (equipoId) await pedir(`/equipos/${equipoId}/asignar-sim`, 'POST', { sim_id: simId });
      }

      if (agregarLicencia) {
        const proveedor = valor(form, 'proveedor'); const inicio = valor(form, 'fecha_inicio');
        if (!proveedor || !inicio) throw new Error('Para registrar la licencia, selecciona proveedor e ingresa la fecha de inicio.');
        const rawEquipo = valor(form, 'licencia_equipo'); const rawSim = valor(form, 'licencia_sim');
        const equipoId = rawEquipo === 'nuevo' ? idEquipoNuevo : rawEquipo ? Number(rawEquipo) : null;
        const simId = rawSim === 'nuevo' ? idSimNueva : rawSim ? Number(rawSim) : null;
        await pedir('/licencias', 'POST', {
          cliente_id: idCliente, proveedor, producto: 'Licencia PoC', meses: Number(valor(form, 'meses') || 12),
          fecha_inicio: inicio, ...(valor(form, 'fecha_vence') ? { fecha_vence: valor(form, 'fecha_vence') } : {}),
          incluye_sim: valor(form, 'incluye_sim') === '1' ? 1 : 0, equipo_id: equipoId, sim_id: simId,
          ...(rol === 'admin' ? { precio: valor(form, 'precio') ? Number(valor(form, 'precio')) : null, pagada: valor(form, 'pagada') === '1' ? 1 : 0 } : {}),
          notas: textoOCero(valor(form, 'notas_licencia')),
        });
        setAgregarLicencia(false); completado.push('licencia');
      }

      await Promise.all([cargarClientes(), cargarRecursosCliente(String(idCliente)), cargarServidores()]);
      setMensaje(`Listo: ${[...completado, ...(modoCliente === 'nuevo' && !completado.includes('cliente') ? ['cliente'] : [])].join(', ')} quedó registrado para ${String(nombreCliente ?? 'el cliente')}. Puedes continuar agregándole otros datos aquí mismo.`);
      setEquipoNuevoId(null); setSimNuevaId(null);
      if (formElement.isConnected) formElement.reset();
    } catch (e) {
      await Promise.all([cargarClientes().catch(() => undefined), cargarRecursosCliente(String(idCliente)).catch(() => undefined), cargarServidores().catch(() => undefined)]);
      const detalle = e instanceof Error ? e.message : 'No se pudo guardar la información.';
      setError(completado.length ? `Se guardaron ${completado.join(' y ')}. ${detalle} Los campos que faltaron siguen disponibles para completar el registro.` : detalle);
    } finally { setGuardando(false); }
  }

  const opcionesEquipo = [...equipos, ...(equipoNuevoId ? [{ id: equipoNuevoId, nombre: 'Equipo agregado en este registro', imei: '' }] : [])];
  const opcionesSim = [...sims, ...(simNuevaId ? [{ id: simNuevaId, iccid: 'SIM agregada en este registro' }] : [])];

  return <div className="integrated-page">
    <div className="welcome"><div><div className="eyebrow">REGISTRO UNIFICADO</div><h1>Clientes y servicios</h1><p>Registra cliente, radio, SIM, licencia y servidor desde un solo formulario. Solo llena lo que aplique.</p></div><span className="record-count">{clientes.length} clientes cargados</span></div>
    {error && <div className="notice" role="alert"><span>ⓘ</span><div><b>No se completó todo el registro</b><p>{error}</p></div></div>}
    {mensaje && <div className="notice success-notice" role="status"><span>✓</span><div><b>Información guardada</b><p>{mensaje}</p></div></div>}
    <form onSubmit={(e) => void guardar(e)}>
      <section className="integration-card"><div className="integration-title"><span>1</span><div><h2>Cliente</h2><p>Elige uno existente o crea uno nuevo.</p></div></div>
        <div className="mode-switch"><button type="button" className={modoCliente === 'nuevo' ? 'selected' : ''} onClick={() => { setModoCliente('nuevo'); setClienteId(''); setEquipoNuevoId(null); setSimNuevaId(null); }}>Nuevo cliente</button><button type="button" className={modoCliente === 'existente' ? 'selected' : ''} onClick={() => setModoCliente('existente')}>Ya existe</button></div>
        {modoCliente === 'existente' ? <label className="integration-field"><span>Cliente</span><select required value={clienteId} onChange={(e) => { if (e.target.value !== clienteId) { setEquipoNuevoId(null); setSimNuevaId(null); } setClienteId(e.target.value); }}><option value="">Selecciona un cliente…</option>{clientes.map((c) => <option value={String(c.id)} key={String(c.id)}>{String(c.nombre)}{c.nit ? ` · ${String(c.nit)}` : ''}</option>)}</select></label> : <div className="integration-grid">
          <label className="integration-field"><span>Nombre del cliente *</span><input name="cliente_nombre" required maxLength={160} placeholder="Nombre o razón social" /></label>
          <label className="integration-field"><span>Responsable comercial *</span><input name="responsable_comercial" required maxLength={160} /></label>
          <label className="integration-field"><span>NIT</span><input name="nit" maxLength={40} /></label>
          <label className="integration-field"><span>Contacto</span><input name="contacto" maxLength={160} /></label>
          <label className="integration-field"><span>Teléfono</span><input name="telefono" maxLength={40} /></label>
          <label className="integration-field"><span>Correo electrónico</span><input name="email" type="email" maxLength={255} /></label>
          <label className="integration-field"><span>Ciudad</span><input name="ciudad" maxLength={100} /></label>
          <label className="integration-field"><span>Dirección</span><input name="direccion" maxLength={240} /></label>
        </div>}
      </section>

      <section className="integration-card"><div className="integration-title"><span>2</span><div><h2>¿Qué vas a registrar?</h2><p>Marca solo los componentes que incluye esta venta o actualización.</p></div></div>
        <div className="integration-toggles">
          <label><input type="checkbox" checked={agregarEquipo} onChange={(e) => setAgregarEquipo(e.target.checked)} /><span><b>Equipo / radio</b><small>Alias, marca, modelo, IMEI, serial y servidor</small></span></label>
          <label><input type="checkbox" checked={agregarSim} onChange={(e) => setAgregarSim(e.target.checked)} /><span><b>SIM card</b><small>ICCID y datos del operador</small></span></label>
          <label><input type="checkbox" checked={agregarLicencia} onChange={(e) => setAgregarLicencia(e.target.checked)} /><span><b>Licencia PoC</b><small>Proveedor Next-PoC o Hytera</small></span></label>
        </div>

        {agregarEquipo && <fieldset className="integration-subform"><legend>Equipo y servidor</legend><div className="integration-grid">
          <label className="integration-field"><span>Alias del equipo</span><input name="equipo_nombre" maxLength={80} placeholder="Ej. Radio recepción" /></label>
          <label className="integration-field"><span>Marca</span><input name="marca" maxLength={100} /></label>
          <label className="integration-field"><span>Modelo</span><input name="modelo" maxLength={100} /></label>
          <label className="integration-field"><span>IMEI</span><input name="imei" maxLength={40} /></label>
          <label className="integration-field"><span>Serial</span><input name="serial" maxLength={80} /></label>
          <label className="integration-field"><span>Fecha de envío</span><input name="fecha_envio" type="date" /></label>
          <label className="integration-field"><span>Servidor — IP o dominio</span><input name="servidor_host" maxLength={255} placeholder="Opcional" /></label>
          <label className="integration-field"><span>Puerto</span><input name="servidor_puerto" type="number" min="1" max="65535" placeholder="Opcional" /></label>
          <label className="integration-field"><span>Nombre del servidor</span><input name="servidor_nombre" maxLength={120} placeholder="Si queda vacío, se usa IP:puerto" /></label>
          <label className="integration-field"><span>Plataforma</span><input name="servidor_plataforma" maxLength={120} /></label>
          <label className="integration-field full-width"><span>Notas del equipo</span><textarea name="notas_equipo" rows={2} maxLength={2000} /></label>
        </div><p className="integration-hint">Si esa misma IP y puerto ya están registrados, se reutiliza el servidor. El mismo servidor con otro puerto se registra por separado.</p></fieldset>}

        {agregarSim && <fieldset className="integration-subform"><legend>SIM card</legend><div className="mode-switch"><button type="button" className={modoSim === 'nueva' ? 'selected' : ''} onClick={() => setModoSim('nueva')}>Registrar nueva</button><button type="button" className={modoSim === 'existente' ? 'selected' : ''} onClick={() => setModoSim('existente')}>Usar una registrada</button></div><div className="integration-grid">
          {modoSim === 'existente' ? <label className="integration-field full-width"><span>SIM existente</span><select name="sim_existente_id" required defaultValue=""><option value="">Selecciona una SIM…</option>{sims.map((x) => <option value={String(x.id)} key={String(x.id)}>{String(x.iccid)} · {String(x.operador ?? 'operador pendiente')}{x.equipo_id ? ` · asociada al equipo ${String(x.equipo_id)}` : ''}</option>)}</select></label> : <>
          <label className="integration-field"><span>ICCID *</span><input name="iccid" required minLength={5} maxLength={30} /></label>
          <label className="integration-field"><span>Operador</span><select name="operador" defaultValue=""><option value="">Pendiente</option>{['Tigo','Claro','Movistar'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="integration-field"><span>Número de línea</span><input name="numero_linea" maxLength={40} /></label>
          <label className="integration-field"><span>Fecha de activación</span><input name="fecha_activacion" type="date" /></label>
          <label className="integration-field"><span>Vencimiento del plan</span><input name="plan_vence" type="date" /></label>
          <label className="integration-field"><span>Plan de datos</span><input name="plan_nombre" maxLength={120} /></label>
          </>}
          <label className="integration-field full-width"><span>Asociar la SIM a un equipo (opcional)</span><select name="sim_equipo" defaultValue=""><option value="">Sin equipo asociado</option>{agregarEquipo && <option value="nuevo">Equipo de este registro</option>}{equipos.map((x) => <option value={String(x.id)} key={String(x.id)}>{String(x.nombre ?? x.imei ?? x.serial ?? `Equipo ${x.id}`)}</option>)}</select></label>
        </div></fieldset>}

        {agregarLicencia && <fieldset className="integration-subform"><legend>Licencia PoC</legend><div className="integration-grid">
          <label className="integration-field"><span>Proveedor *</span><select name="proveedor" required defaultValue=""><option value="">Selecciona…</option><option>Next-PoC</option><option>Hytera</option></select></label>
          <label className="integration-field"><span>Duración *</span><select name="meses" required defaultValue="12">{['1','3','6','12','24'].map((m) => <option value={m} key={m}>{m} meses</option>)}</select></label>
          <label className="integration-field"><span>Fecha de inicio *</span><input name="fecha_inicio" required type="date" defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())} /></label>
          <label className="integration-field"><span>Fecha de vencimiento</span><input name="fecha_vence" type="date" /></label>
          {rol === 'admin' && <><label className="integration-field"><span>Precio del periodo (COP)</span><input name="precio" type="number" min="0" /></label><label className="integration-field"><span>Pago</span><select name="pagada" defaultValue="0"><option value="0">Pendiente</option><option value="1">Pagada</option></select></label></>}
          <label className="integration-field"><span>Incluye SIM</span><select name="incluye_sim" defaultValue="0"><option value="0">No</option><option value="1">Sí</option></select></label>
          <label className="integration-field"><span>Asociar a un equipo (opcional)</span><select name="licencia_equipo" defaultValue=""><option value="">No asociar</option>{agregarEquipo && <option value="nuevo">Equipo de este registro</option>}{opcionesEquipo.map((x) => <option value={String(x.id)} key={String(x.id)}>{String(x.nombre ?? x.imei ?? x.serial ?? `Equipo ${x.id}`)}</option>)}</select></label>
          <label className="integration-field"><span>Asociar a una SIM (opcional)</span><select name="licencia_sim" defaultValue=""><option value="">No asociar</option>{agregarSim && <option value="nuevo">SIM de este registro</option>}{opcionesSim.map((x) => <option value={String(x.id)} key={String(x.id)}>{String(x.iccid)}</option>)}</select></label>
          <label className="integration-field full-width"><span>Notas de la licencia</span><textarea name="notas_licencia" rows={2} maxLength={2000} /></label>
        </div><p className="integration-hint">Puedes vender esta licencia sin registrar ni asociar equipo o SIM.</p></fieldset>}
      </section>
      {clientes.length > 0 && <section className="integration-card customer-picker"><div className="integration-title"><span>↳</span><div><h2>Clientes registrados</h2><p>Selecciona uno para agregarle equipo, SIM o licencia en este mismo formulario.</p></div></div><div className="customer-picker-list">{clientes.slice(0, 8).map((c) => <button type="button" key={String(c.id)} className={clienteId === String(c.id) && modoCliente === 'existente' ? 'chosen' : ''} onClick={() => { if (String(c.id) !== clienteId) { setEquipoNuevoId(null); setSimNuevaId(null); } setModoCliente('existente'); setClienteId(String(c.id)); }}><b>{String(c.nombre)}</b><small>{String(c.responsable_comercial ?? 'Responsable pendiente')} · {String(c.equipos ?? 0)} equipos · {String(c.sims ?? 0)} SIM</small></button>)}</div></section>}
      <div className="integration-submit"><span>{rol === 'lector' ? 'Tu rol permite consultar, pero no agregar registros.' : 'Al guardar, se crean juntos los registros que marcaste.'}</span><button className="primary" disabled={guardando || rol === 'lector'}>{guardando ? 'Guardando…' : 'Guardar cliente y servicios'}</button></div>
    </form>
  </div>;
}
