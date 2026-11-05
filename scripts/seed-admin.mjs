import { spawnSync } from 'node:child_process';

const destino = process.argv[2] ?? 'local';
const baseDatos = {
  local: ['control-clientes-local', ['--local']],
  staging: ['control-clientes-staging', ['--remote', '--env', 'staging']],
  production: ['control-clientes-production', ['--remote', '--env', 'production']],
}[destino];
if (!baseDatos) throw new Error('Destino inválido. Usa local, staging o production.');

const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Define FIRST_ADMIN_EMAIL con un correo válido antes de ejecutar el seed.');
}

const valor = email.replaceAll("'", "''");
const sql = `INSERT INTO usuarios (email, rol, activo) VALUES ('${valor}', 'admin', 1) ON CONFLICT(email) DO UPDATE SET rol = 'admin', activo = 1;`;
const args = ['exec', 'wrangler', 'd1', 'execute', baseDatos[0], ...baseDatos[1], '--command', sql];
const resultado = spawnSync('pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (resultado.status !== 0) process.exit(resultado.status ?? 1);
