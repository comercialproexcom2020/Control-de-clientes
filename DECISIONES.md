# Decisiones de implementación

- El proyecto se crea aislado en `D:\Desktop\Codex\control-clientes`; el directorio padre no es un repositorio Git y contiene otras apps.
- Se mantiene el stack indicado: Hono, React/Vite, Tailwind, D1, zod y Vitest.
- Cloudflare recomienda `wrangler.jsonc`; los assets usarán `run_worker_first` para `/api/*` y fallback SPA.
- Los datos iniciales de negocio no se sembrarán hasta que el usuario los proporcione. La especificación confirma que sus IP, fechas y otros valores son provisionales.
- Los campos financieros quedan reservados al rol admin, conforme al valor por defecto de la especificación.
- La configuración de Access y los identificadores de D1 son placeholders; se completarán al conectar el proyecto al equipo/cuenta de Cloudflare del usuario.
- No se crean registros provisionales de servidores, clientes, equipos o SIM. Operadores SIM y productos/licencias quedan pendientes de los datos confirmados.
- El primer administrador se creará con `FIRST_ADMIN_EMAIL` mediante el script de seed; aún falta el correo que debe autorizarse.
- `bitacora.entidad` incluye `servidor`, necesario para auditar cambios de host/puerto y movimientos de equipos.
- El flujo de despliegue valida tipos, lint, pruebas y build antes de publicar.
- Wrangler indicó que esta sesión no está autenticada. No hay despliegue remoto hasta iniciar sesión en Cloudflare y completar los identificadores y secretos del proyecto.
