import worker from '../../src/worker/index';
import type { Env } from '../../src/worker/env';

type EntornoPages = Omit<Cloudflare.Env, 'ASSETS'>;
type ContextoPages = {
  request: Request;
  env: EntornoPages;
  waitUntil: ExecutionContext['waitUntil'];
};

export async function onRequest(context: ContextoPages): Promise<Response> {
  return await worker.fetch(context.request, context.env as Env, context as unknown as ExecutionContext);
}
