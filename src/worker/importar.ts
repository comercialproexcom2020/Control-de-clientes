import { Hono } from 'hono';
import { z } from 'zod';
import { requiereRoles, usuarioActual, type AuthEnv } from './auth';
import { validarFechaISO } from './fechas';

const app = new Hono<AuthEnv>();
const soloEscritura = requiereRoles('admin', 'editor');
const filaSchema = z.object({
  archivo: z.string().trim().min(1).max(255),
  fila: z.number().int().min(1).max(100_000),
  cliente: z.string().trim().min(1).max(160),
  responsable_comercial: z.string().trim().min(1).max(160),
  host: z.string().trim().min(1).max(255),
  puerto: z.string().trim().regex(/^\d{1,5}$/).refine((v) => Number(v) >= 1 && Number(v) <= 65535),
  nombre: z.string().trim().max(80).nullable(),
  operador: z.enum(['Tigo', 'Claro', 'Movistar']).nullable(),
  iccid: z.string().trim().min(5).max(30).nullable(),
  imei: z.string().trim().min(5).max(40),
  marca: z.string().trim().max(100).nullable(),
  modelo: z.string().trim().max(100).nullable(),
  serial: z.string().trim().max(80).nullable(),
  fecha_activacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validarFechaISO).nullable(),
  fecha_envio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validarFechaISO).nullable(),
  notas: z.string().trim().max(2000).nullable(),
}).strict();
const cuerpoSchema = z.object({ registros: z.array(filaSchema).min(1).max(100) }).strict();
type Fila = z.infer<typeof filaSchema>;
type ErrorImportacion = { archivo: string; fila?: number; mensaje: string };

function llave(valor: string) { return valor.trim().toLocaleLowerCase('es-CO'); }

async function revisar(db: D1Database, filas: Fila[]) {
  const errores: ErrorImportacion[] = [];
  const clientes = new Map<string, { nombre: string; responsable: string; archivo: string; fila: number }>();
  const imeis = new Map<string, number>();
  const iccids = new Map<string, number>();
  const servidores = new Set<string>();
  for (const fila of filas) {
    const claveCliente = llave(fila.cliente);
    const cliente = clientes.get(claveCliente);
    if (cliente && llave(cliente.responsable) !== llave(fila.responsable_comercial)) errores.push({ archivo: fila.archivo, fila: fila.fila, mensaje: `El cliente «${fila.cliente}» tiene más de un responsable comercial en el archivo.` });
    else if (!cliente) clientes.set(claveCliente, { nombre: fila.cliente, responsable: fila.responsable_comercial, archivo: fila.archivo, fila: fila.fila });
    const previoImei = imeis.get(fila.imei);
    if (previoImei) errores.push({ archivo: fila.archivo, fila: fila.fila, mensaje: `IMEI repetido; también aparece en la fila ${previoImei}.` }); else imeis.set(fila.imei, fila.fila);
    if (fila.iccid) { const previoIccid = iccids.get(fila.iccid); if (previoIccid) errores.push({ archivo: fila.archivo, fila: fila.fila, mensaje: `ICCID repetido; también aparece en la fila ${previoIccid}.` }); else iccids.set(fila.iccid, fila.fila); }
    servidores.add(`${llave(fila.host)}\u0000${fila.puerto}`);
  }

  const nombresClientes = [...clientes.values()];
  if (nombresClientes.length) {
    const nombres = nombresClientes.map((x) => x.nombre);
    const existentes = await db.prepare(`SELECT nombre,responsable_comercial FROM clientes WHERE lower(trim(nombre)) IN (${nombres.map(() => '?').join(',')})`).bind(...nombres).all<{ nombre: string; responsable_comercial: string | null }>();
    const porNombre = new Map((existentes.results ?? []).map((x) => [llave(x.nombre), x]));
    for (const cliente of nombresClientes) {
      const actual = porNombre.get(llave(cliente.nombre));
      if (actual?.responsable_comercial && llave(actual.responsable_comercial) !== llave(cliente.responsable)) errores.push({ archivo: cliente.archivo, fila: cliente.fila, mensaje: `El cliente «${cliente.nombre}» ya tiene otro responsable comercial registrado.` });
    }
  }

  const valoresImei = [...imeis.keys()];
  if (valoresImei.length) {
    const existentes = await db.prepare(`SELECT imei FROM equipos WHERE imei IN (${valoresImei.map(() => '?').join(',')})`).bind(...valoresImei).all<{ imei: string }>();
    const existentesSet = new Set((existentes.results ?? []).map((x) => x.imei));
    for (const fila of filas) if (existentesSet.has(fila.imei)) errores.push({ archivo: fila.archivo, fila: fila.fila, mensaje: 'El IMEI ya existe en la aplicación.' });
  }

  const valoresIccid = [...iccids.keys()];
  if (valoresIccid.length) {
    const existentes = await db.prepare(`SELECT iccid FROM sims WHERE iccid IN (${valoresIccid.map(() => '?').join(',')})`).bind(...valoresIccid).all<{ iccid: string }>();
    const existentesSet = new Set((existentes.results ?? []).map((x) => x.iccid));
    for (const fila of filas) if (fila.iccid && existentesSet.has(fila.iccid)) errores.push({ archivo: fila.archivo, fila: fila.fila, mensaje: 'El ICCID ya existe en la aplicación.' });
  }

  return {
    errores,
    resumen: { clientes: clientes.size, servidores: servidores.size, equipos: filas.length, sims: filas.filter((x) => x.iccid !== null).length },
    clientes: [...clientes.values()],
    servidores: [...new Map(filas.map((x) => [`${llave(x.host)}\u0000${x.puerto}`, { host: x.host, puerto: x.puerto }])).values()],
  };
}

app.post('/importar/inventario/previsualizar', soloEscritura, async (c) => {
  const cuerpo = cuerpoSchema.safeParse(await c.req.json());
  if (!cuerpo.success) return c.json({ error: 'Importación inválida', detalle: 'Verifica que cada fila tenga cliente, responsable comercial, servidor e IMEI válidos; máximo 100 radios por carga.', campos_invalidos: cuerpo.error.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message })) }, 400);
  const analisis = await revisar(c.env.DB, cuerpo.data.registros);
  return c.json({ puede_importar: analisis.errores.length === 0, errores: analisis.errores, resumen: analisis.resumen });
});

app.post('/importar/inventario', soloEscritura, async (c) => {
  const cuerpo = cuerpoSchema.safeParse(await c.req.json());
  if (!cuerpo.success) return c.json({ error: 'Importación inválida', detalle: 'Verifica las filas y vuelve a cargar el archivo.', campos_invalidos: cuerpo.error.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message })) }, 400);
  const filas = cuerpo.data.registros;
  const analisis = await revisar(c.env.DB, filas);
  if (analisis.errores.length) return c.json({ error: 'Hay errores en la carga', errores: analisis.errores }, 409);

  const comandos: D1PreparedStatement[] = [];
  for (const cliente of analisis.clientes) {
    comandos.push(c.env.DB.prepare(`INSERT INTO clientes (nombre,responsable_comercial) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE lower(trim(nombre))=lower(trim(?)))`).bind(cliente.nombre, cliente.responsable, cliente.nombre));
    comandos.push(c.env.DB.prepare(`UPDATE clientes SET responsable_comercial=? WHERE lower(trim(nombre))=lower(trim(?)) AND (responsable_comercial IS NULL OR trim(responsable_comercial)='')`).bind(cliente.responsable, cliente.nombre));
  }
  for (const servidor of analisis.servidores) {
    comandos.push(c.env.DB.prepare(`INSERT OR IGNORE INTO servidores (nombre,host,puerto,activo) VALUES (?,?,?,1)`).bind(`Servidor ${servidor.host}:${servidor.puerto}`, servidor.host, servidor.puerto));
  }
  for (const fila of filas) {
    const estadoEquipo = fila.iccid ? 'Activo' : 'En bodega';
    comandos.push(c.env.DB.prepare(`INSERT INTO equipos (cliente_id,nombre,marca,modelo,imei,serial,estado,fecha_envio,servidor_id,notas) VALUES ((SELECT id FROM clientes WHERE lower(trim(nombre))=lower(trim(?)) ORDER BY id LIMIT 1),?,?,?,?,?,?,?,(SELECT id FROM servidores WHERE host=? AND puerto=? ORDER BY id LIMIT 1),?)`).bind(fila.cliente, fila.nombre, fila.marca, fila.modelo, fila.imei, fila.serial, estadoEquipo, fila.fecha_envio, fila.host, fila.puerto, fila.notas));
    if (fila.iccid) {
      comandos.push(c.env.DB.prepare(`INSERT INTO sims (iccid,operador,estado,cliente_id,equipo_id,fecha_activacion,notas) VALUES (?,?,'En uso',(SELECT id FROM clientes WHERE lower(trim(nombre))=lower(trim(?)) ORDER BY id LIMIT 1),(SELECT id FROM equipos WHERE imei=?),?,?)`).bind(fila.iccid, fila.operador, fila.cliente, fila.imei, fila.fecha_activacion, fila.notas));
    }
  }
  comandos.push(c.env.DB.prepare(`INSERT INTO bitacora (usuario,entidad,accion,detalle) VALUES (?,'sistema','importar',?)`).bind(usuarioActual(c).email, `Importación de inventario: ${analisis.resumen.clientes} clientes, ${analisis.resumen.servidores} servidores, ${analisis.resumen.equipos} equipos y ${analisis.resumen.sims} SIM.`));
  try {
    await c.env.DB.batch(comandos);
  } catch (error) {
    console.error('Falló la importación de inventario', error);
    return c.json({ error: 'No se completó la importación', detalle: 'La base de datos rechazó la carga y se revirtió. Vuelve a previsualizar el archivo.' }, 409);
  }
  return c.json({ mensaje: 'Importación completada.', resumen: analisis.resumen }, 201);
});

export default app;
