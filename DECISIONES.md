# Decisiones de implementación

- El proyecto se crea aislado en `D:\Desktop\Codex\control-clientes`; el directorio padre no es un repositorio Git y contiene otras apps.
- Se mantiene el stack indicado: Hono, React/Vite, Tailwind, D1, zod y Vitest.
- Cloudflare recomienda `wrangler.jsonc`; los assets usarán `run_worker_first` para `/api/*` y fallback SPA.
- Los datos iniciales de negocio no se sembrarán hasta que el usuario los proporcione. La especificación confirma que sus IP, fechas y otros valores son provisionales.
- Los campos financieros quedan reservados al rol admin, conforme al valor por defecto de la especificación.
- Las D1 `control-clientes-staging` y `control-clientes-production` se crearon en la cuenta Cloudflare autenticada; sus IDs están en `wrangler.jsonc` y la migración inicial se aplicó a ambas. No contienen registros de negocio.
- Wrangler quedó autenticado con scopes de lectura de usuario/cuenta y escritura de Workers/D1. El despliegue espera configurar Cloudflare Access (equipo, AUD y política del correo administrador).
- No se crean registros provisionales de servidores, clientes, equipos o SIM. Operadores SIM y productos/licencias quedan pendientes de los datos confirmados.
- El admin inicial está provisionado en ambas D1 con el correo de la cuenta Cloudflare autenticada; no se incluye ese correo en el repositorio. Falta agregarlo a la política Allow de Access.
- `bitacora.entidad` incluye `servidor`, necesario para auditar cambios de host/puerto y movimientos de equipos.
- El flujo de despliegue valida tipos, lint, pruebas y build antes de publicar.
- El Worker aún no se ha desplegado porque falta configurar Access, el correo del primer administrador y los secretos de GitHub Actions.
