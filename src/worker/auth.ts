import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env';

export type Rol = 'admin' | 'editor' | 'lector';
export type Usuario = { email: string; rol: Rol };
export type Variables = { usuario: Usuario };
export type AuthEnv = { Bindings: Env; Variables: Variables };
export type AppContext = Context<AuthEnv>;

const conjuntos = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function llaves(domain: string) {
  let jwks = conjuntos.get(domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${domain.replace(/\/$/, '')}/cdn-cgi/access/certs`));
    conjuntos.set(domain, jwks);
  }
  return jwks;
}

export const autenticar: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token || !c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) {
    return c.json({ error: 'No autorizado', detalle: 'Falta la identidad verificada de Cloudflare Access.' }, 401);
  }
  try {
    const dominio = c.env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
    const { payload } = await jwtVerify(token, llaves(dominio), { issuer: dominio, audience: c.env.ACCESS_AUD });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) return c.json({ error: 'No autorizado', detalle: 'Access no entregó un correo válido.' }, 401);
    const usuario = await c.env.DB.prepare('SELECT email, rol FROM usuarios WHERE email = ? AND activo = 1').bind(email).first<Usuario>();
    if (!usuario) return c.json({ error: 'Prohibido', detalle: 'El usuario no está habilitado en la aplicación.' }, 403);
    c.set('usuario', usuario);
    await next();
  } catch {
    return c.json({ error: 'No autorizado', detalle: 'La sesión de Cloudflare Access no es válida.' }, 401);
  }
};

export function requiereRoles(...roles: Rol[]): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const usuario = c.get('usuario');
    if (!roles.includes(usuario.rol)) return c.json({ error: 'Prohibido', detalle: 'No tienes permiso para esta acción.' }, 403);
    await next();
  };
}

export function usuarioActual(c: AppContext): Usuario { return c.get('usuario'); }
