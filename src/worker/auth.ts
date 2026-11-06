import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from './env';

export type Rol = 'admin' | 'editor' | 'lector';
export type Usuario = { email: string; rol: Rol };
export type Variables = { usuario: Usuario };
export type AuthEnv = { Bindings: Env; Variables: Variables };
export type AppContext = Context<AuthEnv>;

const nombreCookie = 'cc_sesion';
const horasSesion = 8;
const codificador = new TextEncoder();
const hashFalso = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function base64url(datos: Uint8Array): string {
  let binario = '';
  for (const byte of datos) binario += String.fromCharCode(byte);
  return btoa(binario).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function desdeBase64url(valor: string): Uint8Array {
  const base64 = valor.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - valor.length % 4) % 4);
  return Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0));
}

function parsearHash(hash: string): { vueltas: number; sal: Uint8Array; esperado: Uint8Array } | null {
  const partes = hash.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2-sha256') return null;
  const vueltas = Number(partes[1]);
  if (vueltas !== 100_000) return null;
  try {
    const sal = desdeBase64url(partes[2]);
    const esperado = desdeBase64url(partes[3]);
    return sal.length === 16 && esperado.length === 32 ? { vueltas, sal, esperado } : null;
  } catch { return null; }
}

async function derivar(password: string, sal: Uint8Array, vueltas: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', codificador.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salSegura = new Uint8Array(sal.length);
  salSegura.set(sal);
  const material = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salSegura, iterations: vueltas, hash: 'SHA-256' }, clave, 256);
  return new Uint8Array(material);
}

function igualesConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diferencia = a.length ^ b.length;
  const largo = Math.max(a.length, b.length);
  for (let i = 0; i < largo; i++) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferencia === 0;
}

async function huellaSolicitud(c: AppContext, email: string): Promise<string> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const bytes = await crypto.subtle.digest('SHA-256', codificador.encode(`${email}\n${ip}`));
  return base64url(new Uint8Array(bytes));
}

export function origenPropio(c: AppContext): boolean {
  const origen = c.req.header('Origin');
  if (!origen) return false;
  try {
    const origenUrl = new URL(origen);
    const solicitudUrl = new URL(c.req.url);
    if (origenUrl.origin === solicitudUrl.origin) return true;
    return origenUrl.protocol === 'http:' && solicitudUrl.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(origenUrl.hostname)
      && ['localhost', '127.0.0.1'].includes(solicitudUrl.hostname);
  } catch { return false; }
}

function cookieSesion(c: AppContext, token: string, maxAge: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `${nombreCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function digestToken(token: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', codificador.encode(token))));
}

export async function iniciarSesion(c: AppContext, emailIngresado: string, password: string): Promise<Response> {
  const email = emailIngresado.trim().toLowerCase();
  const claveIntento = await huellaSolicitud(c, email);
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const intento = await c.env.DB.prepare('SELECT intentos, ventana_inicio, bloqueado_hasta FROM intentos_login WHERE clave = ?').bind(claveIntento).first<{ intentos: number; ventana_inicio: string; bloqueado_hasta: string | null }>();
  if (intento?.bloqueado_hasta && intento.bloqueado_hasta > ahoraIso) {
    return c.json({ error: 'Intenta más tarde', detalle: 'Se alcanzó el límite de intentos. Espera 15 minutos.' }, 429, { 'Cache-Control': 'no-store' });
  }

  const usuario = await c.env.DB.prepare('SELECT email, rol, password_hash FROM usuarios WHERE email = ? AND activo = 1').bind(email).first<Usuario & { password_hash: string | null }>();
  const hashGuardado = usuario?.password_hash ?? hashFalso;
  const componentes = parsearHash(hashGuardado) ?? parsearHash(hashFalso)!;
  const derivado = await derivar(password, componentes.sal, componentes.vueltas);
  const valido = Boolean(usuario?.password_hash) && igualesConstante(derivado, componentes.esperado);
  if (!valido || !usuario) {
    const inicioVentana = intento && ahora.getTime() - Date.parse(intento.ventana_inicio) < 15 * 60_000 ? intento.ventana_inicio : ahoraIso;
    const intentos = inicioVentana === intento?.ventana_inicio ? intento.intentos + 1 : 1;
    const bloqueadoHasta = intentos >= 5 ? new Date(ahora.getTime() + 15 * 60_000).toISOString() : null;
    await c.env.DB.prepare(`INSERT INTO intentos_login (clave, intentos, ventana_inicio, bloqueado_hasta) VALUES (?, ?, ?, ?)
      ON CONFLICT(clave) DO UPDATE SET intentos = excluded.intentos, ventana_inicio = excluded.ventana_inicio, bloqueado_hasta = excluded.bloqueado_hasta`)
      .bind(claveIntento, intentos, inicioVentana, bloqueadoHasta).run();
    return c.json({ error: 'No autorizado', detalle: 'El correo o la contraseña no son válidos.' }, 401, { 'Cache-Control': 'no-store' });
  }

  await c.env.DB.prepare('DELETE FROM intentos_login WHERE clave = ?').bind(claveIntento).run();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(tokenBytes);
  const creado = ahoraIso;
  const expira = new Date(ahora.getTime() + horasSesion * 60 * 60_000).toISOString();
  const tokenHash = await digestToken(token);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sesiones WHERE expira_en <= ? OR email = ?').bind(creado, email),
    c.env.DB.prepare('INSERT INTO sesiones (token_hash, email, creado_en, expira_en) VALUES (?, ?, ?, ?)').bind(tokenHash, email, creado, expira),
  ]);
  c.header('Set-Cookie', cookieSesion(c, token, horasSesion * 60 * 60));
  c.header('Cache-Control', 'no-store');
  return c.json({ usuario: { email: usuario.email, rol: usuario.rol } });
}

export async function cerrarSesion(c: AppContext): Promise<Response> {
  const token = getCookie(c, nombreCookie);
  if (token) await c.env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(await digestToken(token)).run();
  c.header('Set-Cookie', cookieSesion(c, '', 0));
  c.header('Cache-Control', 'no-store');
  return c.json({ mensaje: 'Sesión cerrada.' });
}

export const autenticar: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, nombreCookie);
  if (!token) return c.json({ error: 'No autorizado', detalle: 'Inicia sesión para continuar.' }, 401, { 'Cache-Control': 'no-store' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !origenPropio(c)) {
    return c.json({ error: 'Solicitud bloqueada', detalle: 'El origen de la solicitud no es válido.' }, 403);
  }
  const tokenHash = await digestToken(token);
  const ahora = new Date().toISOString();
  const usuario = await c.env.DB.prepare(`SELECT u.email, u.rol FROM sesiones s
    JOIN usuarios u ON u.email = s.email
    WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1 AND u.password_hash IS NOT NULL`)
    .bind(tokenHash, ahora).first<Usuario>();
  if (!usuario) {
    c.header('Set-Cookie', cookieSesion(c, '', 0));
    return c.json({ error: 'Sesión vencida', detalle: 'Inicia sesión nuevamente para continuar.' }, 401, { 'Cache-Control': 'no-store' });
  }
  c.set('usuario', usuario);
  await next();
};

export function requiereRoles(...roles: Rol[]): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const usuario = c.get('usuario');
    if (!roles.includes(usuario.rol)) return c.json({ error: 'Prohibido', detalle: 'No tienes permiso para esta acción.' }, 403);
    await next();
  };
}

export function usuarioActual(c: AppContext): Usuario { return c.get('usuario'); }
