import { Hono } from 'hono';
import { z } from 'zod';
import { requiereRoles, usuarioActual, type AuthEnv } from './auth';
import { baseRenovacion, hoyEnBogota, estadoLicencia, sumarDiasCalendario, sumarMesesCalendario, validarFechaISO } from './fechas';

const app = new Hono<AuthEnv>();
const soloEscritura = requiereRoles('admin', 'editor');
const soloAdmin = requiereRoles('admin');
const mesesSchema = z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.literal(24)]);
const idSchema = z.coerce.number().int().positive();
const texto = (max = 500) => z.string().trim().max(max).nullable().optional();
const numeroId = z.coerce.number().int().positive().nullable().optional();
const entero = z.coerce.number().int().nonnegative().nullable().optional();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validarFechaISO).nullable().optional();
const fechaRequerida = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validarFechaISO);
const puertoSchema = z.string().trim().regex(/^\d{1,5}$/).refine((valor) => Number(valor) >= 1 && Number(valor) <= 65535);

const servidorSchema = z.object({ nombre: z.string().trim().min(1).max(120), host: z.string().trim().min(1).max(255), puerto: puertoSchema, plataforma: texto(120), ubicacion: texto(160), capacidad: entero, notas: texto(2000), activo: z.coerce.number().int().min(0).max(1).optional() }).strict();
const clienteSchema = z.object({ nombre: z.string().trim().min(1).max(160), nit: texto(40), contacto: texto(160), telefono: texto(40), email: z.union([z.email(), z.literal('')]).nullable().optional(), ciudad: texto(100), direccion: texto(240), servidor_id: numeroId, notas: texto(2000), activo: z.coerce.number().int().min(0).max(1).optional() }).strict();
const equipoSchema = z.object({ cliente_id: numeroId, nombre: texto(80), marca: texto(100), modelo: texto(100), imei: texto(40), serial: texto(80), estado: z.enum(['Activo','En bodega','Dañado','Reemplazar','Baja']).optional(), fecha_envio: fecha, servidor_id: numeroId, notas: texto(2000) }).strict();
const simSchema = z.object({ iccid: z.string().trim().min(5).max(30), operador: z.enum(['Tigo','Claro','Movistar']).nullable().optional(), numero_linea: texto(40), estado: z.enum(['Inventario','En uso','Dañada','Reemplazar','Baja']).optional(), cliente_id: numeroId, fecha_activacion: fecha, plan_nombre: texto(120), plan_vence: fecha, costo_mensual: entero, notas: texto(2000) }).strict();
const licenciaSchema = z.object({ cliente_id: z.coerce.number().int().positive(), producto: z.string().trim().min(1).max(160), meses: mesesSchema, fecha_inicio: fechaRequerida, fecha_vence: fechaRequerida.optional(), incluye_sim: z.coerce.number().int().min(0).max(1).optional(), sim_id: numeroId, equipo_id: numeroId, precio: entero, pagada: z.coerce.number().int().min(0).max(1).optional(), anulada: z.coerce.number().int().min(0).max(1).optional(), notas: texto(2000) }).strict();

type Datos = Record<string, unknown>;
const camposFinancieros = new Set(['precio', 'pagada', 'costo_mensual']);
const rotulos: Record<string, string> = { nombre: 'Nombre', host: 'Host', puerto: 'Puerto', servidor_id: 'Servidor', cliente_id: 'Cliente', estado: 'Estado', equipo_id: 'Equipo', operador: 'Operador', producto: 'Producto', meses: 'Duración', fecha_inicio: 'Inicio', fecha_vence: 'Vencimiento', fecha_envio: 'Fecha de envío', incluye_sim: 'Incluye SIM', serial: 'Serial', imei: 'IMEI', iccid: 'ICCID', plan_vence: 'Vencimiento del plan' };

function parsear<T>(schema: z.ZodType<T>, datos: unknown): T | null {
  const parsed = schema.safeParse(datos);
  return parsed.success ? parsed.data : null;
}

function detalleCambios(anterior: Datos | null, nuevo: Datos, operacion: string): string {
  if (!anterior) return `Se creó el registro (${operacion}).`;
  const entradas = Object.entries(nuevo).filter(([campo, valor]) => anterior[campo] !== valor);
  const hayFinanzas = entradas.some(([campo]) => camposFinancieros.has(campo));
  const cambios = entradas.filter(([campo]) => !camposFinancieros.has(campo)).map(([campo, valor]) => `${rotulos[campo] ?? campo}: ${String(anterior[campo] ?? '—')} → ${String(valor ?? '—')}`);
  if (hayFinanzas) cambios.push('Se actualizaron datos financieros.');
  return cambios.length ? cambios.join('; ') : 'Se guardó el registro sin cambios en los campos enviados.';
}

function quitarFinanzas(usuario: { rol: string }, entidad: string, datos: Datos) {
  if (usuario.rol === 'admin') return datos;
  const limpio = { ...datos };
  if (entidad === 'sim') delete limpio.costo_mensual;
  if (entidad === 'licencia') { delete limpio.precio; delete limpio.pagada; }
  return limpio;
}

function bitacora(c: Parameters<typeof usuarioActual>[0], entidad: string, id: number | null, accion: string, detalle: string) {
  const usuario = usuarioActual(c);
  return c.env.DB.prepare('INSERT INTO bitacora (usuario, entidad, entidad_id, accion, detalle) VALUES (?, ?, ?, ?, ?)')
    .bind(usuario.email, entidad, id, accion, detalle);
}

function listaParams(url: URL) {
  const pagina = Math.max(1, Math.min(100000, Number(url.searchParams.get('page')) || 1));
  const limite = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));
  return { pagina, limite, inicio: (pagina - 1) * limite, q: (url.searchParams.get('q') ?? '').trim().slice(0, 120) };
}

async function listar(c: Parameters<typeof usuarioActual>[0], tabla: string, columnas: string, buscar: string[], filtros: Record<string, { columna: string; esquema: z.ZodType }> = {}, extra = '') {
  const { pagina, limite, inicio, q } = listaParams(new URL(c.req.url));
  const where = [extra].filter(Boolean);
  const valores: unknown[] = [];
  if (q && buscar.length) {
    where.push(`(${buscar.map((columna) => `${columna} LIKE ?`).join(' OR ')})`);
    buscar.forEach(() => valores.push(`%${q}%`));
  }
  const filtrosUrl = new URL(c.req.url).searchParams;
  for (const [clave, filtro] of Object.entries(filtros)) {
    const valor = filtrosUrl.get(clave);
    if (valor === null) continue;
    const parsed = filtro.esquema.safeParse(valor);
    if (!parsed.success) return c.json({ error: 'Filtro inválido', detalle: `El filtro ${clave} no tiene un valor válido.` }, 400);
    where.push(`${filtro.columna} = ?`);
    valores.push(parsed.data);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const usuario = usuarioActual(c);
  const select = usuario.rol === 'admin' ? columnas : columnas.split(',').map((col) => col.trim()).filter((col) => !camposFinancieros.has(col.split(' ').pop() ?? '')).join(', ');
  const [{ results: datos = [] }, total] = await Promise.all([
    c.env.DB.prepare(`SELECT ${select} FROM ${tabla} ${sqlWhere} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...valores, limite, inicio).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${tabla} ${sqlWhere}`).bind(...valores).first<{ total: number }>(),
  ]);
  return c.json({ datos, pagina, limite, total: total?.total ?? 0 });
}

async function obtener(c: Parameters<typeof usuarioActual>[0], tabla: string, id: number, columnas: string) {
  const usuario = usuarioActual(c);
  const select = usuario.rol === 'admin' ? columnas : columnas.split(',').map((col) => col.trim()).filter((col) => !camposFinancieros.has(col.split(' ').pop() ?? '')).join(', ');
  const registro = await c.env.DB.prepare(`SELECT ${select} FROM ${tabla} WHERE id = ?`).bind(id).first<Datos>();
  return registro;
}

function idRuta(c: Parameters<typeof usuarioActual>[0]): number | null {
  return parsear(idSchema, c.req.param('id')) ?? null;
}

async function crear(c: Parameters<typeof usuarioActual>[0], tabla: string, entidad: string, schema: z.ZodType<Datos>, datos: unknown, aviso?: string) {
  const validado = parsear(schema, datos);
  const nuevo = validado ? quitarFinanzas(usuarioActual(c), entidad, validado) : null;
  if (!nuevo) return c.json({ error: 'Datos inválidos', detalle: 'Revisa los campos y vuelve a intentarlo.' }, 400);
  const valores = Object.entries(nuevo).filter(([, v]) => v !== undefined);
  const columnas = valores.map(([k]) => k);
  const marcas = columnas.map(() => '?').join(', ');
  try {
    const comandos = [
      c.env.DB.prepare(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcas})`).bind(...valores.map(([, v]) => v)),
      c.env.DB.prepare('INSERT INTO bitacora (usuario, entidad, entidad_id, accion, detalle) VALUES (?, ?, last_insert_rowid(), ?, ?)').bind(usuarioActual(c).email, entidad, 'crear', detalleCambios(null, nuevo, entidad)),
    ];
    const resultados = await c.env.DB.batch(comandos);
    const id = Number(resultados[0]?.meta.last_row_id ?? 0);
    if (!id) return c.json({ error: 'Error al guardar', detalle: 'No se pudo crear el registro.' }, 500);
    return c.json({ id, mensaje: 'Registro creado correctamente.', ...(aviso ? { aviso } : {}) }, 201);
  } catch (error) {
    const mensaje = error instanceof Error && /unique/i.test(error.message) ? 'Ya existe un registro con esos datos.' : 'No fue posible crear el registro.';
    return c.json({ error: 'No se pudo guardar', detalle: mensaje }, /unique/i.test(error instanceof Error ? error.message : '') ? 409 : 400);
  }
}

async function editar(c: Parameters<typeof usuarioActual>[0], tabla: string, entidad: string, id: number, schema: z.ZodType<Datos>, datos: unknown) {
  const validado = parsear(schema, datos);
  const nuevo = validado ? quitarFinanzas(usuarioActual(c), entidad, validado) : null;
  if (!nuevo || !Object.keys(nuevo).length) return c.json({ error: 'Datos inválidos', detalle: 'Envía al menos un campo válido.' }, 400);
  const anterior = await c.env.DB.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).bind(id).first<Datos>();
  if (!anterior) return c.json({ error: 'No encontrado', detalle: 'El registro solicitado no existe.' }, 404);
  const valores = Object.entries(nuevo).filter(([, v]) => v !== undefined);
  const set = valores.map(([key]) => `${key} = ?`).join(', ');
  try {
    const comandos = [
      c.env.DB.prepare(`UPDATE ${tabla} SET ${set}, actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).bind(...valores.map(([, v]) => v), id),
      bitacora(c, entidad, id, 'editar', await (async () => {
        let detalle = detalleCambios(anterior, nuevo, entidad);
        const cambioHost = entidad === 'servidor' && ((nuevo.host !== undefined && nuevo.host !== anterior.host) || (nuevo.puerto !== undefined && nuevo.puerto !== anterior.puerto));
        if (cambioHost) {
          const afectados = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM equipos WHERE servidor_id = ?').bind(id).first<{ total: number }>();
          detalle += ` Equipos afectados por el cambio: ${afectados?.total ?? 0}.`;
        }
        return detalle;
      })()),
    ];
    const resultados = await c.env.DB.batch(comandos);
    if (!resultados[0]?.success) return c.json({ error: 'No se pudo guardar', detalle: 'La base de datos rechazó el cambio.' }, 400);
    return c.json({ mensaje: 'Cambios guardados correctamente.' });
  } catch (error) {
    const conflicto = error instanceof Error && /unique/i.test(error.message);
    return c.json({ error: 'No se pudo guardar', detalle: conflicto ? 'Ya existe un registro con esos datos.' : 'La base de datos rechazó el cambio.' }, conflicto ? 409 : 400);
  }
}

app.get('/servidores', async (c) => {
  const { pagina, limite, inicio, q } = listaParams(new URL(c.req.url)); const params = new URL(c.req.url).searchParams;
  const condiciones: string[] = []; const valores: unknown[] = [];
  if (q) { condiciones.push('(s.nombre LIKE ? OR s.host LIKE ? OR s.puerto LIKE ?)'); valores.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  const activo = params.get('activo'); if (activo !== null) { if (!['0','1'].includes(activo)) return c.json({ error: 'Filtro inválido', detalle: 'El filtro de estado no es válido.' }, 400); condiciones.push('s.activo = ?'); valores.push(Number(activo)); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [lista,total] = await Promise.all([
    c.env.DB.prepare(`SELECT s.id,s.nombre,s.host,s.puerto,s.plataforma,s.ubicacion,s.capacidad,s.notas,s.activo,s.creado_en,s.actualizado_en,(SELECT COUNT(*) FROM equipos e WHERE e.servidor_id=s.id) AS equipos,(SELECT COUNT(*) FROM clientes c2 WHERE c2.servidor_id=s.id) AS clientes FROM servidores s ${where} ORDER BY s.nombre LIMIT ? OFFSET ?`).bind(...valores,limite,inicio).all<Datos>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM servidores s ${where}`).bind(...valores).first<{total:number}>(),
  ]);
  return c.json({datos:lista.results??[],pagina,limite,total:total?.total??0});
});
app.get('/servidores/:id', async (c) => { const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); const dato = await obtener(c, 'servidores', id, 'id, nombre, host, puerto, plataforma, ubicacion, capacidad, notas, activo, creado_en, actualizado_en'); return dato ? c.json(dato) : c.json({ error: 'No encontrado', detalle: 'El servidor no existe.' }, 404); });
app.post('/servidores', soloEscritura, async (c) => crear(c, 'servidores', 'servidor', servidorSchema, await c.req.json()));
app.patch('/servidores/:id', soloEscritura, async (c) => { const id = idRuta(c); return id ? editar(c, 'servidores', 'servidor', id, servidorSchema.partial() as z.ZodType<Datos>, await c.req.json()) : c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); });
app.delete('/servidores/:id', soloAdmin, async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const registro = await c.env.DB.prepare('SELECT nombre FROM servidores WHERE id = ?').bind(id).first<{ nombre: string }>();
  if (!registro) return c.json({ error: 'No encontrado', detalle: 'El servidor no existe.' }, 404);
  const asociados = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM equipos WHERE servidor_id = ?').bind(id).first<{ total: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM clientes WHERE servidor_id = ?').bind(id).first<{ total: number }>(),
  ]);
  const equipos = asociados[0]?.total ?? 0;
  const clientes = asociados[1]?.total ?? 0;
  const consulta = equipos + clientes ? c.env.DB.prepare('UPDATE servidores SET activo = 0, actualizado_en = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ?') : c.env.DB.prepare('DELETE FROM servidores WHERE id = ?');
  const estado = equipos + clientes ? 'desactivar' : 'eliminar';
  await c.env.DB.batch([consulta.bind(id), bitacora(c, 'servidor', id, estado, equipos + clientes ? `Se desactivó el servidor ${registro.nombre}; conserva ${equipos} equipos y ${clientes} clientes asociados.` : `Se eliminó el servidor ${registro.nombre}.`)]);
  return c.json({ mensaje: equipos + clientes ? 'El servidor tiene registros asociados y quedó desactivado.' : 'Servidor eliminado.' });
});

app.post('/servidores/:id/mover-equipos', soloEscritura, async (c) => {
  const origenId = idRuta(c); if (!origenId) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador del servidor no es válido.' }, 400);
  const schema = z.object({ equipo_ids: z.array(z.coerce.number().int().positive()).min(1).max(100), servidor_destino_id: z.coerce.number().int().positive().nullable(), motivo: z.string().trim().min(1).max(500) }).strict();
  const cuerpo = parsear(schema, await c.req.json());
  if (!cuerpo || new Set(cuerpo.equipo_ids).size !== cuerpo.equipo_ids.length) return c.json({ error: 'Datos inválidos', detalle: 'Selecciona hasta 100 equipos sin repetir e incluye el motivo.' }, 400);
  if (cuerpo.servidor_destino_id === origenId) return c.json({ error: 'Datos inválidos', detalle: 'El servidor de destino debe ser diferente al de origen.' }, 400);
  const origen = await c.env.DB.prepare('SELECT nombre FROM servidores WHERE id = ?').bind(origenId).first<{ nombre: string }>();
  if (!origen) return c.json({ error: 'No encontrado', detalle: 'El servidor de origen no existe.' }, 404);
  const destino = cuerpo.servidor_destino_id ? await c.env.DB.prepare('SELECT nombre, capacidad, activo FROM servidores WHERE id = ?').bind(cuerpo.servidor_destino_id).first<{ nombre: string; capacidad: number | null; activo: number }>() : null;
  if (cuerpo.servidor_destino_id && (!destino || !destino.activo)) return c.json({ error: 'Datos inválidos', detalle: 'El servidor de destino no existe o está inactivo.' }, 400);
  const marcas = cuerpo.equipo_ids.map(() => '?').join(',');
  const equipos = await c.env.DB.prepare(`SELECT id, nombre FROM equipos WHERE servidor_id = ? AND id IN (${marcas})`).bind(origenId, ...cuerpo.equipo_ids).all<{ id: number; nombre: string | null }>();
  if ((equipos.results?.length ?? 0) !== cuerpo.equipo_ids.length) return c.json({ error: 'Datos inválidos', detalle: 'Uno o más equipos no pertenecen al servidor de origen.' }, 409);
  let aviso: string | undefined;
  if (destino?.capacidad !== null && destino?.capacidad !== undefined) {
    const actual = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM equipos WHERE servidor_id = ?').bind(cuerpo.servidor_destino_id).first<{ total: number }>();
    const usados = (actual?.total ?? 0) + cuerpo.equipo_ids.length;
    if (usados > destino.capacidad) aviso = `El servidor ${destino.nombre} quedará por encima de su capacidad (${usados}/${destino.capacidad}).`;
  }
  const comandos = (equipos.results ?? []).flatMap((equipo) => [
    c.env.DB.prepare('UPDATE equipos SET servidor_id = ?, actualizado_en = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ?').bind(cuerpo.servidor_destino_id, equipo.id),
    bitacora(c, 'equipo', equipo.id, 'mover', `Servidor: ${origen.nombre} → ${destino?.nombre ?? 'sin servidor'}. Motivo: ${cuerpo.motivo}.`),
  ]);
  await c.env.DB.batch(comandos);
  return c.json({ mensaje: `${equipos.results?.length ?? 0} equipos movidos correctamente.`, ...(aviso ? { aviso } : {}) });
});

app.get('/clientes', async (c) => {
  const { pagina,limite,inicio,q }=listaParams(new URL(c.req.url)); const params=new URL(c.req.url).searchParams; const condiciones:string[]=[]; const valores:unknown[]=[];
  if(q){condiciones.push('(c.nombre LIKE ? OR c.nit LIKE ? OR c.contacto LIKE ? OR c.telefono LIKE ?)');valores.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}
  const activo=params.get('activo');if(activo!==null){if(!['0','1'].includes(activo))return c.json({error:'Filtro inválido',detalle:'El filtro de estado no es válido.'},400);condiciones.push('c.activo = ?');valores.push(Number(activo))}
  const servidor=params.get('servidor_id');if(servidor!==null){const id=parsear(idSchema,servidor);if(!id)return c.json({error:'Filtro inválido',detalle:'El servidor debe ser un identificador positivo.'},400);condiciones.push('c.servidor_id = ?');valores.push(id)}
  const where=condiciones.length?`WHERE ${condiciones.join(' AND ')}`:'';const hoy=hoyEnBogota();
  const [lista,total]=await Promise.all([
    c.env.DB.prepare(`SELECT c.id,c.nombre,c.nit,c.contacto,c.telefono,c.email,c.ciudad,c.direccion,c.servidor_id,s.nombre AS servidor,c.notas,c.activo,c.creado_en,c.actualizado_en,(SELECT COUNT(*) FROM equipos e WHERE e.cliente_id=c.id) AS equipos,(SELECT COUNT(*) FROM sims sm WHERE sm.cliente_id=c.id) AS sims,(SELECT MIN(l.fecha_vence) FROM licencias l WHERE l.cliente_id=c.id AND l.anulada=0 AND l.fecha_vence>=?) AS proximo_vencimiento FROM clientes c LEFT JOIN servidores s ON s.id=c.servidor_id ${where} ORDER BY c.nombre LIMIT ? OFFSET ?`).bind(hoy,...valores,limite,inicio).all<Datos>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM clientes c ${where}`).bind(...valores).first<{total:number}>(),
  ]);return c.json({datos:lista.results??[],pagina,limite,total:total?.total??0});
});
app.get('/clientes/:id', async (c) => { const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); const dato = await obtener(c, 'clientes', id, 'id, nombre, nit, contacto, telefono, email, ciudad, direccion, servidor_id, notas, activo, creado_en, actualizado_en'); return dato ? c.json(dato) : c.json({ error: 'No encontrado', detalle: 'El cliente no existe.' }, 404); });
app.get('/clientes/:id/historial', async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const existe = await c.env.DB.prepare('SELECT id FROM clientes WHERE id = ?').bind(id).first<{ id: number }>();
  if (!existe) return c.json({ error: 'No encontrado', detalle: 'El cliente no existe.' }, 404);
  const { pagina, limite, inicio } = listaParams(new URL(c.req.url));
  const where = `(entidad = 'cliente' AND entidad_id = ?) OR (entidad = 'equipo' AND entidad_id IN (SELECT id FROM equipos WHERE cliente_id = ?)) OR (entidad = 'sim' AND entidad_id IN (SELECT id FROM sims WHERE cliente_id = ?)) OR (entidad = 'licencia' AND entidad_id IN (SELECT id FROM licencias WHERE cliente_id = ?))`;
  const [datos, total] = await Promise.all([
    c.env.DB.prepare(`SELECT id,ts,usuario,entidad,entidad_id,accion,detalle FROM bitacora WHERE ${where} ORDER BY ts DESC,id DESC LIMIT ? OFFSET ?`).bind(id,id,id,id,limite,inicio).all<Datos>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM bitacora WHERE ${where}`).bind(id,id,id,id).first<{ total: number }>(),
  ]);
  return c.json({ datos: datos.results ?? [], pagina, limite, total: total?.total ?? 0 });
});
app.post('/clientes', soloEscritura, async (c) => crear(c, 'clientes', 'cliente', clienteSchema, await c.req.json()));
app.patch('/clientes/:id', soloEscritura, async (c) => { const id = idRuta(c); return id ? editar(c, 'clientes', 'cliente', id, clienteSchema.partial() as z.ZodType<Datos>, await c.req.json()) : c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); });
app.delete('/clientes/:id', soloAdmin, async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const cliente = await c.env.DB.prepare('SELECT nombre FROM clientes WHERE id = ?').bind(id).first<{ nombre: string }>();
  if (!cliente) return c.json({ error: 'No encontrado', detalle: 'El cliente no existe.' }, 404);
  const consultas = await Promise.all(['equipos','sims','licencias'].map((tabla) => c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${tabla} WHERE cliente_id = ?`).bind(id).first<{ total: number }>()));
  if (consultas.some((r) => (r?.total ?? 0) > 0)) return c.json({ error: 'Acción bloqueada', detalle: 'El cliente tiene equipos, SIM o licencias. Desactívalo o reasigna los registros antes de eliminarlo.' }, 409);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM clientes WHERE id = ?').bind(id), bitacora(c, 'cliente', id, 'eliminar', `Se eliminó el cliente ${cliente.nombre}.`)]);
  return c.json({ mensaje: 'Cliente eliminado.' });
});

app.get('/equipos', async (c) => {
  const {pagina,limite,inicio,q}=listaParams(new URL(c.req.url));const params=new URL(c.req.url).searchParams;const condiciones:string[]=[];const valores:unknown[]=[];
  if(q){condiciones.push('(e.nombre LIKE ? OR e.imei LIKE ? OR e.serial LIKE ? OR e.modelo LIKE ? OR c.nombre LIKE ?)');for(let i=0;i<5;i++)valores.push(`%${q}%`)}
  const filtros:[string,string,RegExp][]=[['estado','e.estado',/^(Activo|En bodega|Dañado|Reemplazar|Baja)$/],['servidor_id','e.servidor_id',/^\d+$/],['cliente_id','e.cliente_id',/^\d+$/]];
  for(const [clave,columna,formato] of filtros){const valor=params.get(clave);if(valor!==null){if(!formato.test(valor))return c.json({error:'Filtro inválido',detalle:`El filtro ${clave} no tiene un valor válido.`},400);condiciones.push(`${columna} = ?`);valores.push(clave==='estado'?valor:Number(valor))}}
  const where=condiciones.length?`WHERE ${condiciones.join(' AND ')}`:'';
  const [lista,total]=await Promise.all([
    c.env.DB.prepare(`SELECT e.id,e.cliente_id,c.nombre AS cliente,e.nombre,e.marca,e.modelo,e.imei,e.serial,e.estado,e.fecha_envio,e.servidor_id,s.nombre AS servidor,s.host AS servidor_host,s.puerto AS servidor_puerto,sm.iccid AS sim_iccid,e.notas,e.creado_en,e.actualizado_en FROM equipos e LEFT JOIN clientes c ON c.id=e.cliente_id LEFT JOIN servidores s ON s.id=e.servidor_id LEFT JOIN sims sm ON sm.equipo_id=e.id ${where} ORDER BY e.nombre LIMIT ? OFFSET ?`).bind(...valores,limite,inicio).all<Datos>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM equipos e LEFT JOIN clientes c ON c.id=e.cliente_id ${where}`).bind(...valores).first<{total:number}>(),
  ]);return c.json({datos:lista.results??[],pagina,limite,total:total?.total??0});
});
app.get('/equipos/:id', async (c) => { const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); const dato = await obtener(c, 'equipos', id, 'id, cliente_id, nombre, marca, modelo, imei, serial, estado, fecha_envio, servidor_id, notas, creado_en, actualizado_en'); return dato ? c.json(dato) : c.json({ error: 'No encontrado', detalle: 'El equipo no existe.' }, 404); });
app.post('/equipos', soloEscritura, async (c) => {
  const datos = parsear(equipoSchema, await c.req.json()); if (!datos) return c.json({ error: 'Datos inválidos', detalle: 'Revisa los campos del equipo.' }, 400);
  if (datos.cliente_id && datos.servidor_id === undefined) {
    const cliente = await c.env.DB.prepare('SELECT servidor_id FROM clientes WHERE id = ?').bind(datos.cliente_id).first<{ servidor_id: number | null }>();
    if (!cliente) return c.json({ error: 'Datos inválidos', detalle: 'El cliente seleccionado no existe.' }, 400);
    datos.servidor_id = cliente.servidor_id;
  }
  let aviso: string | undefined;
  if (datos.servidor_id) {
    const servidor = await c.env.DB.prepare('SELECT nombre, capacidad FROM servidores WHERE id = ? AND activo = 1').bind(datos.servidor_id).first<{ nombre: string; capacidad: number | null }>();
    if (!servidor) return c.json({ error: 'Datos inválidos', detalle: 'El servidor seleccionado no existe o está inactivo.' }, 400);
    if (servidor.capacidad !== null) {
      const actual = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM equipos WHERE servidor_id = ?').bind(datos.servidor_id).first<{ total: number }>();
      if ((actual?.total ?? 0) + 1 > servidor.capacidad) aviso = `El servidor ${servidor.nombre} quedará por encima de su capacidad (${(actual?.total ?? 0) + 1}/${servidor.capacidad}).`;
    }
  }
  const respuesta = await crear(c, 'equipos', 'equipo', equipoSchema, datos, aviso);
  return respuesta;
});
app.patch('/equipos/:id', soloEscritura, async (c) => { const id = idRuta(c); return id ? editar(c, 'equipos', 'equipo', id, equipoSchema.partial() as z.ZodType<Datos>, await c.req.json()) : c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); });

app.post('/equipos/:id/asignar-sim', soloEscritura, async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const body = z.object({ sim_id: z.coerce.number().int().positive().nullable(), estado_sim_anterior: z.enum(['Inventario','Dañada','Reemplazar','Baja']).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos', detalle: 'Indica una SIM válida y el estado de salida opcional.' }, 400);
  const equipo = await c.env.DB.prepare('SELECT id, cliente_id FROM equipos WHERE id = ?').bind(id).first<{ id: number; cliente_id: number | null }>();
  if (!equipo) return c.json({ error: 'No encontrado', detalle: 'El equipo no existe.' }, 404);
  const actual = await c.env.DB.prepare('SELECT id, iccid, estado, cliente_id FROM sims WHERE equipo_id = ?').bind(id).first<{ id: number; iccid: string; estado: string; cliente_id: number | null }>();
  const nueva = body.data.sim_id ? await c.env.DB.prepare('SELECT id, iccid, estado, cliente_id, equipo_id FROM sims WHERE id = ?').bind(body.data.sim_id).first<{ id: number; iccid: string; estado: string; cliente_id: number | null; equipo_id: number | null }>() : null;
  if (body.data.sim_id && !nueva) return c.json({ error: 'No encontrado', detalle: 'La SIM seleccionada no existe.' }, 404);
  if (nueva && !['Inventario','En uso'].includes(nueva.estado)) return c.json({ error: 'Acción bloqueada', detalle: `No se puede asignar una SIM en estado ${nueva.estado}.` }, 409);
  if (nueva && nueva.equipo_id && nueva.equipo_id !== id) return c.json({ error: 'Acción bloqueada', detalle: 'La SIM ya está asignada a otro equipo.' }, 409);
  if (actual?.id === nueva?.id) return c.json({ mensaje: 'Esta SIM ya está asignada al equipo.' });
  const lotes = [];
  if (actual) {
    const estado = body.data.estado_sim_anterior ?? (actual.estado === 'En uso' ? 'Inventario' : actual.estado);
    lotes.push(c.env.DB.prepare('UPDATE sims SET equipo_id = NULL, estado = ?, actualizado_en = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ?').bind(estado, actual.id));
  }
  if (nueva) {
    lotes.push(c.env.DB.prepare('UPDATE sims SET equipo_id = ?, estado = ?, cliente_id = COALESCE(cliente_id, ?), actualizado_en = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ?').bind(id, 'En uso', equipo.cliente_id, nueva.id));
  }
  const cambio = `SIM del equipo: ${actual?.iccid ?? 'ninguna'}${actual ? ` (${actual.estado})` : ''} → ${nueva?.iccid ?? 'ninguna'}${nueva ? ` (En uso; cliente ${nueva.cliente_id ?? equipo.cliente_id ?? 'sin asignar'})` : ''}.`;
  lotes.push(bitacora(c, 'equipo', id, 'asignar', cambio));
  await c.env.DB.batch(lotes);
  return c.json({ mensaje: 'Asignación de SIM actualizada.' });
});

app.get('/sims', (c) => listar(c, 'sims', 'id, iccid, operador, numero_linea, estado, cliente_id, equipo_id, fecha_activacion, plan_nombre, plan_vence, costo_mensual, notas, creado_en, actualizado_en', ['iccid','numero_linea','plan_nombre'], { estado: { columna: 'estado', esquema: simSchema.shape.estado.unwrap() }, operador: { columna: 'operador', esquema: z.enum(['Tigo','Claro','Movistar']) }, cliente_id: { columna: 'cliente_id', esquema: z.coerce.number().int().positive() } }));
app.get('/sims/:id', async (c) => { const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); const dato = await obtener(c, 'sims', id, 'id, iccid, operador, numero_linea, estado, cliente_id, equipo_id, fecha_activacion, plan_nombre, plan_vence, costo_mensual, notas, creado_en, actualizado_en'); return dato ? c.json(dato) : c.json({ error: 'No encontrado', detalle: 'La SIM no existe.' }, 404); });
app.post('/sims', soloEscritura, async (c) => crear(c, 'sims', 'sim', simSchema, await c.req.json()));
app.patch('/sims/:id', soloEscritura, async (c) => { const id = idRuta(c); return id ? editar(c, 'sims', 'sim', id, simSchema.partial() as z.ZodType<Datos>, await c.req.json()) : c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400); });

app.get('/licencias', async (c) => {
  const { pagina, limite, inicio, q } = listaParams(new URL(c.req.url));
  const usuario = usuarioActual(c); const condiciones: string[] = []; const valores: unknown[] = [];
  if (q) { condiciones.push('(l.producto LIKE ? OR c.nombre LIKE ?)'); valores.push(`%${q}%`, `%${q}%`); }
  const estado = new URL(c.req.url).searchParams.get('estado');
  const clienteId = new URL(c.req.url).searchParams.get('cliente_id');
  if (clienteId !== null) { const parsedId = parsear(idSchema, clienteId); if (!parsedId) return c.json({ error: 'Filtro inválido', detalle: 'El cliente debe ser un identificador positivo.' }, 400); condiciones.push('l.cliente_id = ?'); valores.push(parsedId); }
  if (estado) {
    if (!['Anulada','Vencida','Por vencer','Activa'].includes(estado)) return c.json({ error: 'Filtro inválido', detalle: 'El estado de licencia no es válido.' }, 400);
    const hoy = hoyEnBogota();
    const configAlerta = await c.env.DB.prepare("SELECT valor FROM config WHERE clave = 'dias_alerta_licencia'").first<{ valor: string }>();
    const diasAlerta = Number.parseInt(configAlerta?.valor?.split(',')[0] ?? '30', 10) || 30;
    const limiteAlerta = sumarDiasCalendario(hoy, diasAlerta);
    if (estado === 'Anulada') condiciones.push('l.anulada = 1');
    if (estado === 'Vencida') { condiciones.push('l.anulada = 0 AND l.fecha_vence < ?'); valores.push(hoy); }
    if (estado === 'Por vencer') { condiciones.push('l.anulada = 0 AND l.fecha_vence >= ? AND l.fecha_vence <= ?'); valores.push(hoy, limiteAlerta); }
    if (estado === 'Activa') { condiciones.push('l.anulada = 0 AND l.fecha_vence > ?'); valores.push(limiteAlerta); }
  }
  const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const camposAdmin = usuario.rol === 'admin' ? ', l.precio, l.pagada' : '';
  const [lista, total] = await Promise.all([
    c.env.DB.prepare(`SELECT l.id, l.cliente_id, c.nombre AS cliente, l.producto, l.meses, l.fecha_inicio, l.fecha_vence, l.incluye_sim, l.sim_id, l.equipo_id, l.anulada, l.notas${camposAdmin}, l.creado_en, l.actualizado_en FROM licencias l JOIN clientes c ON c.id = l.cliente_id ${filtro} ORDER BY l.fecha_vence ASC LIMIT ? OFFSET ?`).bind(...valores, limite, inicio).all<Datos>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM licencias l JOIN clientes c ON c.id = l.cliente_id ${filtro}`).bind(...valores).first<{ total: number }>(),
  ]);
  const hoy = hoyEnBogota();
  const cfg = await c.env.DB.prepare("SELECT valor FROM config WHERE clave = 'dias_alerta_licencia'").first<{ valor: string }>();
  const diasAlerta = Number.parseInt(cfg?.valor?.split(',')[0] ?? '30', 10) || 30;
  const datos = (lista.results ?? []).map((fila) => ({ ...fila, estado: estadoLicencia(String(fila.fecha_vence), Boolean(fila.anulada), hoy, diasAlerta) }));
  return c.json({ datos, pagina, limite, total: total?.total ?? 0 });
});
app.get('/licencias/:id', async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const usuario = usuarioActual(c); const finanzas = usuario.rol === 'admin' ? ', precio, pagada' : '';
  const licencia = await c.env.DB.prepare(`SELECT id, cliente_id, producto, meses, fecha_inicio, fecha_vence, incluye_sim, sim_id, equipo_id, anulada, notas${finanzas}, creado_en, actualizado_en FROM licencias WHERE id = ?`).bind(id).first<Datos>();
  if (!licencia) return c.json({ error: 'No encontrado', detalle: 'La licencia no existe.' }, 404);
  const renovaciones = await c.env.DB.prepare(`SELECT id, licencia_id, fecha, meses, desde, vence${finanzas}, notas, usuario FROM renovaciones WHERE licencia_id = ? ORDER BY fecha DESC, id DESC`).bind(id).all<Datos>();
  const cfg = await c.env.DB.prepare("SELECT valor FROM config WHERE clave = 'dias_alerta_licencia'").first<{ valor: string }>();
  const diasAlerta = Number.parseInt(cfg?.valor?.split(',')[0] ?? '30', 10) || 30;
  return c.json({ ...licencia, estado: estadoLicencia(String(licencia.fecha_vence), Boolean(licencia.anulada), hoyEnBogota(), diasAlerta), renovaciones: renovaciones.results ?? [] });
});
app.post('/licencias', soloEscritura, async (c) => {
  const datos = parsear(licenciaSchema, await c.req.json()); if (!datos) return c.json({ error: 'Datos inválidos', detalle: 'Revisa cliente, producto, duración y fecha de inicio.' }, 400);
  const calculada = sumarMesesCalendario(datos.fecha_inicio, datos.meses);
  const nuevo = { ...datos, fecha_vence: datos.fecha_vence ?? calculada };
  const result = await crear(c, 'licencias', 'licencia', licenciaSchema.extend({ fecha_vence: z.string() }) as z.ZodType<Datos>, nuevo);
  return result;
});
app.patch('/licencias/:id', soloEscritura, async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const datos = await c.req.json(); const valido = parsear(licenciaSchema.partial(), datos);
  if (!valido) return c.json({ error: 'Datos inválidos', detalle: 'Revisa los campos de la licencia.' }, 400);
  const anterior = await c.env.DB.prepare('SELECT fecha_inicio, meses FROM licencias WHERE id = ?').bind(id).first<{ fecha_inicio: string; meses: number }>();
  if (!anterior) return c.json({ error: 'No encontrado', detalle: 'La licencia no existe.' }, 404);
  if (valido.fecha_inicio || valido.meses) valido.fecha_vence = sumarMesesCalendario(String(valido.fecha_inicio ?? anterior.fecha_inicio), Number(valido.meses ?? anterior.meses));
  return editar(c, 'licencias', 'licencia', id, licenciaSchema.partial().extend({ fecha_vence: z.string().optional() }) as z.ZodType<Datos>, valido);
});
app.post('/licencias/:id/renovar', soloEscritura, async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const schema = z.object({ meses: mesesSchema, precio: entero, pagada: z.coerce.number().int().min(0).max(1).optional(), notas: texto(2000) }).strict();
  const cuerpo = parsear(schema, await c.req.json()); if (!cuerpo) return c.json({ error: 'Datos inválidos', detalle: 'La duración de renovación debe ser 1, 3, 6, 12 o 24 meses.' }, 400);
  const licencia = await c.env.DB.prepare('SELECT fecha_vence, anulada FROM licencias WHERE id = ?').bind(id).first<{ fecha_vence: string; anulada: number }>();
  if (!licencia) return c.json({ error: 'No encontrado', detalle: 'La licencia no existe.' }, 404);
  if (licencia.anulada) return c.json({ error: 'Acción bloqueada', detalle: 'Una licencia anulada debe reactivarse antes de renovarla.' }, 409);
  const hoy = hoyEnBogota(); const desde = baseRenovacion(licencia.fecha_vence, hoy); const vence = sumarMesesCalendario(desde, cuerpo.meses); const usuario = usuarioActual(c);
  const precio = usuario.rol === 'admin' ? cuerpo.precio ?? null : null;
  const pagada = usuario.rol === 'admin' ? cuerpo.pagada ?? 0 : 0;
  const pagoActualizado = usuario.rol === 'admin' ? cuerpo.pagada ?? null : null;
  const comandos = [
    c.env.DB.prepare('INSERT INTO renovaciones (licencia_id, fecha, meses, desde, vence, precio, pagada, notas, usuario) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, hoy, cuerpo.meses, desde, vence, precio, pagada, cuerpo.notas ?? null, usuario.email),
    c.env.DB.prepare('UPDATE licencias SET fecha_vence = ?, meses = ?, precio = COALESCE(?, precio), pagada = COALESCE(?, pagada), actualizado_en = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ?').bind(vence, cuerpo.meses, precio, pagoActualizado, id),
    bitacora(c, 'licencia', id, 'renovar', `Licencia renovada por ${cuerpo.meses} meses: ${desde} → ${vence}.`),
  ];
  await c.env.DB.batch(comandos);
  return c.json({ mensaje: 'Licencia renovada correctamente.', desde, vence });
});

app.get('/bitacora', async (c) => {
  const { pagina, limite, inicio } = listaParams(new URL(c.req.url)); const params = new URL(c.req.url).searchParams;
  const condiciones: string[] = []; const valores: unknown[] = [];
  const entidad = params.get('entidad');
  if (entidad) { const validado = z.enum(['cliente','equipo','sim','licencia','servidor','sistema']).safeParse(entidad); if (!validado.success) return c.json({ error: 'Filtro inválido', detalle: 'La entidad no es válida.' }, 400); condiciones.push('entidad = ?'); valores.push(validado.data); }
  const usuario = params.get('usuario');
  if (usuario) { const validado = z.email().safeParse(usuario); if (!validado.success) return c.json({ error: 'Filtro inválido', detalle: 'El correo no tiene un formato válido.' }, 400); condiciones.push('usuario = ?'); valores.push(validado.data.toLowerCase()); }
  for (const campo of ['entidad_id'] as const) { const valor = params.get(campo); if (valor) { const n = parsear(idSchema, valor); if (!n) return c.json({ error: 'Filtro inválido', detalle: 'El identificador debe ser un entero positivo.' }, 400); condiciones.push(`${campo} = ?`); valores.push(n); } }
  const desde = params.get('desde'); const hasta = params.get('hasta');
  for (const [campo, valor] of [['desde', desde], ['hasta', hasta]] as const) {
    if (valor !== null) { if (!validarFechaISO(valor)) return c.json({ error: 'Filtro inválido', detalle: `La fecha ${campo} debe usar el formato AAAA-MM-DD.` }, 400); condiciones.push(`date(ts) ${campo === 'desde' ? '>=' : '<='} date(?)`); valores.push(valor); }
  }
  if (desde && hasta && desde > hasta) return c.json({ error: 'Filtro inválido', detalle: 'La fecha inicial no puede ser posterior a la fecha final.' }, 400);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [datos, total] = await Promise.all([
    c.env.DB.prepare(`SELECT id, ts, usuario, entidad, entidad_id, accion, detalle FROM bitacora ${where} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`).bind(...valores, limite, inicio).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM bitacora ${where}`).bind(...valores).first<{ total: number }>(),
  ]);
  return c.json({ datos: datos.results ?? [], pagina, limite, total: total?.total ?? 0 });
});

app.get('/servidores/:id/equipos', async (c) => {
  const id = idRuta(c); if (!id) return c.json({ error: 'Solicitud inválida', detalle: 'El identificador no es válido.' }, 400);
  const { pagina, limite, inicio, q } = listaParams(new URL(c.req.url));
  const filas = await c.env.DB.prepare(`SELECT e.id, e.nombre, e.marca, e.modelo, e.imei, e.serial, e.estado, e.cliente_id, c.nombre AS cliente FROM equipos e LEFT JOIN clientes c ON c.id = e.cliente_id WHERE e.servidor_id = ? AND (e.nombre LIKE ? OR c.nombre LIKE ?) ORDER BY c.nombre, e.nombre LIMIT ? OFFSET ?`).bind(id, `%${q}%`, `%${q}%`, limite, inicio).all<Datos>();
  return c.json({ datos: filas.results ?? [], pagina, limite });
});

export default app;
