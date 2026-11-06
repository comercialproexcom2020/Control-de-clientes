import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = process.argv[2] ?? 'local';
const baseDatos = {
  local: ['control-clientes-local', ['--local']],
  staging: ['control-clientes-staging', ['--remote', '--env', 'staging']],
  production: ['control-clientes-production', ['--remote', '--env', 'production']],
}[destino];
if (!baseDatos) throw new Error('Destino inválido. Usa local, staging o production.');

const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.FIRST_ADMIN_PASSWORD;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Define FIRST_ADMIN_EMAIL con un correo válido antes de ejecutar el seed.');
}
if (!password || password.length < 16 || password.length > 128) {
  throw new Error('Define FIRST_ADMIN_PASSWORD con una contraseña de 16 a 128 caracteres. No la guardes en el repositorio.');
}

const valor = email.replaceAll("'", "''");
const sal = randomBytes(16);
const derivado = pbkdf2Sync(password, sal, 100_000, 32, 'sha256');
const hash = `pbkdf2-sha256$100000$${sal.toString('base64url')}$${derivado.toString('base64url')}`;
const sql = `INSERT INTO usuarios (email, rol, activo, password_hash) VALUES ('${valor}', 'admin', 1, '${hash}') ON CONFLICT(email) DO UPDATE SET rol = 'admin', activo = 1, password_hash = excluded.password_hash;`;
const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const args = ['d1', 'execute', baseDatos[0], ...baseDatos[1], '--command', sql];
const resultado = spawnSync(process.execPath, [wrangler, ...args], { cwd: raiz, stdio: 'inherit' });
if (resultado.status !== 0) process.exit(resultado.status ?? 1);
