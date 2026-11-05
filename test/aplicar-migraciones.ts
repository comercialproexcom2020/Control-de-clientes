import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import type { Env } from '../src/worker/env';

const entorno = env as unknown as Env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
await applyD1Migrations(entorno.DB, entorno.TEST_MIGRATIONS);
