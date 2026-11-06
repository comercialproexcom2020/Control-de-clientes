import { Hono } from 'hono';
import { z } from 'zod';
import { autenticar, cerrarSesion, iniciarSesion, origenPropio, usuarioActual, type AuthEnv } from './auth';
import { hoyEnBogota, sumarDiasCalendario } from './fechas';
import rutas from './rutas';
import type { Env } from './env';

const app = new Hono<AuthEnv>();
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
});
const inicioSesionSchema = z.object({ email: z.email().max(254), password: z.string().min(16).max(128) }).strict();

app.post('/api/sesion', async (c) => {
  if (!origenPropio(c)) return c.json({ error: 'Solicitud bloqueada', detalle: 'El origen de la solicitud no es válido.' }, 403);
  const cuerpo = inicioSesionSchema.safeParse(await c.req.json().catch(() => null));
  if (!cuerpo.success) return c.json({ error: 'Datos inválidos', detalle: 'Ingresa un correo válido y una contraseña de al menos 16 caracteres.' }, 400);
  return iniciarSesion(c, cuerpo.data.email, cuerpo.data.password);
});
app.delete('/api/sesion', async (c) => {
  if (!origenPropio(c)) return c.json({ error: 'Solicitud bloqueada', detalle: 'El origen de la solicitud no es válido.' }, 403);
  return cerrarSesion(c);
});

app.use('/api/*', autenticar);
app.get('/api/health', (c) => c.json({ estado: 'ok' }));
app.route('/api', rutas);

app.get('/api/yo', (c) => c.json({ usuario: usuarioActual(c) }));
app.get('/api/sesion', (c) => c.json({ usuario: usuarioActual(c) }, 200, { 'Cache-Control': 'no-store' }));
app.get('/api/resumen', async (c) => {
  const hoy = hoyEnBogota();
  const limite = sumarDiasCalendario(hoy, 30);
  const { results = [] } = await c.env.DB.prepare(`
    SELECT 'clientes' AS clave, COUNT(*) AS cantidad FROM clientes WHERE activo = 1
    UNION ALL SELECT 'licencias_por_vencer', COUNT(*) FROM licencias WHERE anulada = 0 AND fecha_vence >= ? AND fecha_vence <= ?
    UNION ALL SELECT 'licencias_vencidas', COUNT(*) FROM licencias WHERE anulada = 0 AND fecha_vence < ?
    UNION ALL SELECT 'sims_inventario', COUNT(*) FROM sims WHERE estado = 'Inventario'
    UNION ALL SELECT 'sims_en_uso', COUNT(*) FROM sims WHERE estado = 'En uso'
    UNION ALL SELECT 'sims_danadas', COUNT(*) FROM sims WHERE estado = 'Dañada'
    UNION ALL SELECT 'sims_reemplazar', COUNT(*) FROM sims WHERE estado = 'Reemplazar'
  `).bind(hoy, limite, hoy).all<{ clave: string; cantidad: number }>();
  return c.json(Object.fromEntries(results.map(({ clave, cantidad }) => [clave, cantidad])));
});

app.notFound((c) => c.json({ error: 'No encontrado', detalle: 'La ruta solicitada no existe.' }, 404));
app.onError((error, c) => {
  if (error instanceof SyntaxError) return c.json({ error: 'Solicitud inválida', detalle: 'El cuerpo de la solicitud debe ser JSON válido.' }, 400);
  console.error(error);
  return c.json({ error: 'Error interno', detalle: 'No fue posible completar la solicitud.' }, 500);
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
};
