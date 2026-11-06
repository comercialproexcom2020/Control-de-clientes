import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import rutas from '../src/worker/rutas';
import type { AuthEnv, Rol } from '../src/worker/auth';
import type { Env } from '../src/worker/env';
import { hoyEnBogota, sumarMesesCalendario } from '../src/worker/fechas';
import worker from '../src/worker/index';

const testEnv = env as unknown as Env;

const prueba = new Hono<AuthEnv>();
prueba.use('*', async (c, next) => {
  const rol = (c.req.header('X-Test-Rol') ?? 'lector') as Rol;
  c.set('usuario', { email: 'pruebas@example.com', rol });
  await next();
});
prueba.route('/api', rutas);

async function pedir(ruta: string, opciones: RequestInit = {}, rol: Rol = 'admin') {
  const headers = new Headers(opciones.headers);
  headers.set('X-Test-Rol', rol);
  if (opciones.body) headers.set('Content-Type', 'application/json');
  return prueba.request(`http://test.local/api${ruta}`, { ...opciones, headers }, testEnv);
}

describe('API principal', () => {
  let clienteId = 0;
  beforeAll(async () => {
    const r = await pedir('/clientes', { method: 'POST', body: JSON.stringify({ nombre: `Cliente pruebas ${crypto.randomUUID()}`, responsable_comercial: 'Asesor de pruebas' }) });
    expect(r.status).toBe(201);
    clienteId = Number((await r.json() as { id: number }).id);
  });

  it('exige una sesión iniciada en las rutas del Worker', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/resumen'), testEnv, {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('reserva las mutaciones para admin y editor', async () => {
    const r = await pedir('/clientes', { method: 'POST', body: JSON.stringify({ nombre: 'No permitido' }) }, 'lector');
    expect(r.status).toBe(403);
  });

  it('crea un registro y su entrada de bitácora en la misma operación', async () => {
    const r = await pedir('/servidores', { method: 'POST', body: JSON.stringify({ nombre: `Servidor ${crypto.randomUUID()}`, host: '192.0.2.1', puerto: '10023' }) });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: number };
    const registro = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM bitacora WHERE entidad = ? AND entidad_id = ?').bind('servidor', id).first<{ n: number }>();
    expect(registro?.n).toBe(1);
  });

  it('previsualiza e importa inventario agrupando servidores por IP y puerto', async () => {
    const sufijo = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const cliente = `Cliente carga ${sufijo}`;
    const registros = [
      { archivo: 'Cliente A.csv', fila: 3, cliente, responsable_comercial: 'Asesora A', host: '198.51.100.40', puerto: '10001', nombre: 'Radio A', operador: 'Claro', iccid: `8957${sufijo}`, imei: `86${sufijo}`, marca: 'Marca', modelo: 'Modelo', serial: 'SER-A', fecha_activacion: '2026-10-01', fecha_envio: null, notas: null },
      { archivo: 'Cliente A.csv', fila: 4, cliente, responsable_comercial: 'Asesora A', host: '198.51.100.40', puerto: '10002', nombre: 'Radio B', operador: null, iccid: null, imei: `87${sufijo}`, marca: 'Marca', modelo: 'Modelo', serial: 'SER-B', fecha_activacion: null, fecha_envio: null, notas: null },
    ];
    const previa = await pedir('/importar/inventario/previsualizar', { method: 'POST', body: JSON.stringify({ registros }) }, 'editor');
    expect(previa.status, await previa.clone().text()).toBe(200);
    expect(await previa.json()).toMatchObject({ puede_importar: true, resumen: { clientes: 1, servidores: 2, equipos: 2, sims: 1 } });

    const importacion = await pedir('/importar/inventario', { method: 'POST', body: JSON.stringify({ registros }) }, 'editor');
    expect(importacion.status).toBe(201);
    const clienteGuardado = await testEnv.DB.prepare('SELECT responsable_comercial FROM clientes WHERE nombre = ?').bind(cliente).first<{ responsable_comercial: string }>();
    expect(clienteGuardado?.responsable_comercial).toBe('Asesora A');
    const puertos = await testEnv.DB.prepare('SELECT COUNT(DISTINCT s.puerto) AS total FROM equipos e JOIN servidores s ON s.id=e.servidor_id WHERE e.cliente_id=(SELECT id FROM clientes WHERE nombre=?)').bind(cliente).first<{ total: number }>();
    expect(puertos?.total).toBe(2);
    const sims = await testEnv.DB.prepare('SELECT COUNT(*) AS total FROM sims WHERE cliente_id=(SELECT id FROM clientes WHERE nombre=?) AND estado=?').bind(cliente, 'En uso').first<{ total: number }>();
    expect(sims?.total).toBe(1);
  });

  it('asigna SIM de inventario, completa el cliente y rechaza SIM dañada', async () => {
    const equipoRespuesta = await pedir('/equipos', { method: 'POST', body: JSON.stringify({ cliente_id: clienteId, nombre: `Radio ${crypto.randomUUID()}` }) });
    expect(equipoRespuesta.status).toBe(201);
    const { id: equipoId } = await equipoRespuesta.json() as { id: number };
    const inventario = await pedir('/sims', { method: 'POST', body: JSON.stringify({ iccid: `8957${crypto.randomUUID().replaceAll('-', '').slice(0, 15)}` }) });
    const danada = await pedir('/sims', { method: 'POST', body: JSON.stringify({ iccid: `8958${crypto.randomUUID().replaceAll('-', '').slice(0, 15)}`, estado: 'Dañada' }) });
    expect(inventario.status).toBe(201);
    expect(danada.status).toBe(201);
    const inventarioId = Number((await inventario.json() as { id: number }).id);
    const danadaId = Number((await danada.json() as { id: number }).id);
    const asignar = await pedir(`/equipos/${equipoId}/asignar-sim`, { method: 'POST', body: JSON.stringify({ sim_id: inventarioId }) }, 'editor');
    expect(asignar.status).toBe(200);
    const sim = await testEnv.DB.prepare('SELECT estado, cliente_id, equipo_id FROM sims WHERE id = ?').bind(inventarioId).first<{ estado: string; cliente_id: number; equipo_id: number }>();
    expect(sim).toMatchObject({ estado: 'En uso', cliente_id: clienteId, equipo_id: equipoId });
    const rechazar = await pedir(`/equipos/${equipoId}/asignar-sim`, { method: 'POST', body: JSON.stringify({ sim_id: danadaId }) }, 'editor');
    expect(rechazar.status).toBe(409);
    const sigueAsignada = await testEnv.DB.prepare('SELECT equipo_id FROM sims WHERE id = ?').bind(inventarioId).first<{ equipo_id: number }>();
    expect(sigueAsignada?.equipo_id).toBe(equipoId);
  });

  it('calcula vencimiento, renueva desde hoy si venció y conserva historial', async () => {
    const creada = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente_id: clienteId, proveedor: 'Next-PoC', producto: 'Plan de prueba', meses: 1, fecha_inicio: '2026-01-31', fecha_vence: '2026-02-28' }) });
    expect(creada.status).toBe(201);
    const id = Number((await creada.json() as { id: number }).id);
    const hoy = hoyEnBogota();
    const renovar = await pedir(`/licencias/${id}/renovar`, { method: 'POST', body: JSON.stringify({ meses: 3 }) }, 'editor');
    expect(renovar.status).toBe(200);
    expect(await renovar.json()).toMatchObject({ desde: hoy, vence: sumarMesesCalendario(hoy, 3) });
    const actual = await testEnv.DB.prepare('SELECT fecha_vence, meses, precio, pagada FROM licencias WHERE id = ?').bind(id).first<{ fecha_vence: string; meses: number; precio: number | null; pagada: number }>();
    expect(actual).toMatchObject({ fecha_vence: sumarMesesCalendario(hoy, 3), meses: 3, precio: null, pagada: 0 });
    const historial = await testEnv.DB.prepare('SELECT COUNT(*) AS total FROM renovaciones WHERE licencia_id = ?').bind(id).first<{ total: number }>();
    expect(historial?.total).toBe(1);
  });

  it('oculta y descarta datos financieros que envíe un editor', async () => {
    const r = await pedir('/sims', { method: 'POST', body: JSON.stringify({ iccid: `8959${crypto.randomUUID().replaceAll('-', '').slice(0, 15)}`, costo_mensual: 99000 }) }, 'editor');
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: number };
    const detalle = await pedir(`/sims/${id}`, {}, 'editor');
    const datos = await detalle.json() as Record<string, unknown>;
    expect(datos).not.toHaveProperty('costo_mensual');
    const fila = await testEnv.DB.prepare('SELECT costo_mensual FROM sims WHERE id = ?').bind(id).first<{ costo_mensual: number | null }>();
    expect(fila?.costo_mensual).toBeNull();
  });

  it('omite precio y pago de licencias para lectores y editores', async () => {
    const creada = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente_id: clienteId, proveedor: 'Hytera', producto: 'Licencia con precio', meses: 6, fecha_inicio: '2026-11-05', precio: 245000, pagada: 1 }) });
    const id = Number((await creada.json() as { id: number }).id);
    const detalle = await pedir(`/licencias/${id}`, {}, 'editor');
    const datos = await detalle.json() as Record<string, unknown>;
    expect(datos).not.toHaveProperty('precio');
    expect(datos).not.toHaveProperty('pagada');
    const lista = await pedir('/licencias', {}, 'lector');
    const filas = (await lista.json() as { datos: Record<string, unknown>[] }).datos;
    expect(filas.find((fila) => fila.id === id)).not.toHaveProperty('precio');
  });

  it('mueve varios equipos en una transacción y avisa si supera capacidad', async () => {
    const origen = await pedir('/servidores', { method: 'POST', body: JSON.stringify({ nombre: `Origen ${crypto.randomUUID()}`, host: '198.51.100.10', puerto: '10023', capacidad: 10 }) });
    const destino = await pedir('/servidores', { method: 'POST', body: JSON.stringify({ nombre: `Destino ${crypto.randomUUID()}`, host: '198.51.100.11', puerto: '10023', capacidad: 1 }) });
    const origenId = Number((await origen.json() as { id: number }).id);
    const destinoId = Number((await destino.json() as { id: number }).id);
    const equipos: number[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await pedir('/equipos', { method: 'POST', body: JSON.stringify({ cliente_id: clienteId, nombre: `Mover ${crypto.randomUUID()}`, servidor_id: origenId }) });
      equipos.push(Number((await r.json() as { id: number }).id));
    }
    const movimiento = await pedir(`/servidores/${origenId}/mover-equipos`, { method: 'POST', body: JSON.stringify({ equipo_ids: equipos, servidor_destino_id: destinoId, motivo: 'Prueba de movimiento' }) }, 'editor');
    expect(movimiento.status).toBe(200);
    expect((await movimiento.json() as { aviso: string }).aviso).toMatch(/capacidad/i);
    const datos = await testEnv.DB.prepare('SELECT COUNT(*) AS total FROM equipos WHERE servidor_id = ?').bind(destinoId).first<{ total: number }>();
    expect(datos?.total).toBe(2);
    const eventos = await testEnv.DB.prepare("SELECT COUNT(*) AS total FROM bitacora WHERE entidad = 'equipo' AND entidad_id IN (?,?) AND accion = 'mover'").bind(...equipos).first<{ total: number }>();
    expect(eventos?.total).toBe(2);
  });

  it('impide editar o borrar bitácora desde la base de datos', async () => {
    const insercion = await testEnv.DB.prepare("INSERT INTO bitacora (usuario, entidad, accion, detalle) VALUES (?, 'sistema', 'prueba', 'entrada inmutable')").bind('pruebas@example.com').run();
    const id = Number(insercion.meta.last_row_id);
    await expect(testEnv.DB.prepare('UPDATE bitacora SET detalle = ? WHERE id = ?').bind('alterada', id).run()).rejects.toThrow(/append-only/i);
    await expect(testEnv.DB.prepare('DELETE FROM bitacora WHERE id = ?').bind(id).run()).rejects.toThrow(/append-only/i);
  });
});
