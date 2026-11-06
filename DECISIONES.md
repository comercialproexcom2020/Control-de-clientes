# Decisiones de implementación

- El proyecto se crea aislado en `D:\Desktop\Codex\control-clientes`; el directorio padre no es un repositorio Git y contiene otras apps.
- Se mantiene Hono, React/Vite, Tailwind, D1, zod y Vitest. El repositorio se aloja en Cloudflare Pages con Pages Functions, a partir del proyecto GitHub que el usuario ya creó; Functions enruta `/api/*` al Worker Hono existente.
- Cloudflare recomienda `wrangler.jsonc`; los assets usarán `run_worker_first` para `/api/*` y fallback SPA.
- Los datos iniciales de negocio no se sembrarán hasta que el usuario los proporcione. La especificación confirma que sus IP, fechas y otros valores son provisionales.
- Los campos financieros quedan reservados al rol admin, conforme al valor por defecto de la especificación.
- Las D1 `control-clientes-staging` y `control-clientes-production` se crearon en la cuenta Cloudflare autenticada; sus IDs están en `wrangler.jsonc` y la migración inicial se aplicó a ambas. No contienen registros de negocio.
- Wrangler requiere reautenticación local si se despliega desde esta sesión. El acceso a Cloudflare se hará con login propio, no requiere Zero Trust ni tarjeta.
- No se crean registros provisionales de servidores, clientes, equipos o SIM. Operadores SIM y productos/licencias quedan pendientes de los datos confirmados.
- El admin inicial está provisionado en ambas D1 con el correo de la cuenta Cloudflare autenticada. La migración `0002_autenticacion.sql` está aplicada; falta registrar la contraseña del admin mediante `FIRST_ADMIN_PASSWORD`.
- `bitacora.entidad` incluye `servidor`, necesario para auditar cambios de host/puerto y movimientos de equipos.
- GitHub Actions valida tipos, lint, pruebas y build en `staging` y `main`; Cloudflare Pages crea vista previa para `staging` y publica `main` como producción.
- El backend aún no se ha desplegado como Pages Function; falta provisionar la contraseña inicial y subir la rama `staging` para generar la vista previa.
- Por preferencia expresa del usuario, no se registra un medio de pago para Zero Trust. Se sustituye Cloudflare Access por login propio: hash PBKDF2-SHA256 con salt aleatorio, sesión opaca almacenada por hash en D1, cookie HttpOnly/SameSite, expiración de ocho horas, validación de Origin en mutaciones y limitación de intentos de contraseña. Esta decisión se aparta de las secciones 2, 10 y 12 de `SPEC.md`; se debe revisar si más adelante la organización habilita Cloudflare Access.
- La contraseña inicial del admin se provisiona con `FIRST_ADMIN_PASSWORD` solo durante el seed. La gestión visual para crear colaboradores y restablecer contraseñas aún no está implementada; el usuario actual solicitó comenzar como único admin.
- El binding `DB` de Pages usa D1 staging en vista previa y D1 producción en `main`; el comando de build es `pnpm build` con salida `dist` y Node 22.
