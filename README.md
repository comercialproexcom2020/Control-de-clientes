# Control de clientes, equipos, SIM y licencias

Aplicación para PROEXCOM. La interfaz está en español de Colombia y el despliegue objetivo usa Cloudflare Workers, D1, React y Cloudflare Access.

## Estado

La primera versión de la Fase 1 está implementada y validada localmente. Las bases D1 remotas de staging y producción ya existen y tienen el esquema inicial aplicado; ambas permanecen vacías. El despliegue del Worker espera la configuración de Cloudflare Access.

## Requisitos

- Node.js 22 o superior y pnpm.
- Cuenta Cloudflare con Workers, D1 y Zero Trust/Access.
- Cuenta GitHub; el repositorio actual es público, así que no se deben guardar secretos ni datos de negocio en el código.

## Desarrollo local

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
# Completar ACCESS_TEAM_DOMAIN y ACCESS_AUD para probar la API con una sesión Access real.
pnpm db:migrate:local
pnpm dev
```

Vite sirve la interfaz en `http://localhost:5173` y reenvía `/api` al Worker local en el puerto 8787. Las rutas de negocio requieren un JWT válido emitido por Access y un correo activo en `usuarios`. No hay bypass de autenticación en desarrollo.

## Cloudflare Access

1. En Cloudflare Zero Trust, abre **Access controls > Applications** y crea una aplicación **Self-hosted** para el hostname de la app.
2. Añade una política Allow con los correos o el proveedor de identidad autorizado. Configura la sesión de acuerdo con la política de la organización.
3. Copia el **Application Audience (AUD) Tag** y el dominio del equipo (`https://<equipo>.cloudflareaccess.com`).
4. Carga ambos valores como variables de entorno del Worker (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) y en `.dev.vars` para desarrollo.
5. El Worker valida firma, `iss`, `aud` y expiración con las llaves públicas publicadas por Access, y luego exige un registro activo en `usuarios`. El dominio completo debe quedar detrás de Access.

La app depende de que el hostname de Workers esté protegido por la aplicación Access. No se debe publicar una ruta alternativa sin Access.

## Base de datos y primer admin

`migrations/0001_init.sql` crea las tablas, índices y una protección de base de datos contra UPDATE/DELETE de la bitácora. Cada entorno tiene su propia base D1.

1. Las bases `control-clientes-staging` y `control-clientes-production` están creadas. Sus IDs están registrados en `wrangler.jsonc`; no son secretos.
2. La migración inicial está aplicada en ambas. No se han cargado clientes, servidores, equipos, SIM ni licencias.
3. El usuario administrador inicial ya está provisionado en staging y producción con el correo de la cuenta Cloudflare autenticada. Agrégalo a la política Allow de Cloudflare Access. Para provisionar otro correo en el futuro:

```powershell
$env:FIRST_ADMIN_EMAIL = 'admin@tu-dominio.com'
pnpm seed:admin:staging
pnpm seed:admin:production
```

El seed solo añade o reactiva ese correo con rol `admin`; no incluye contraseñas ni tokens. Agrega también ese correo a la política Allow de Cloudflare Access.

## GitHub Actions y despliegue

Configura en el repositorio los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` con permisos limitados a los recursos necesarios. El workflow CI corre en los cambios; el despliegue es manual desde Actions para elegir staging o producción y validar primero los secretos. No publiques credenciales en el repositorio público.

Antes del primer despliegue configura una aplicación Cloudflare Access para el hostname elegido, carga `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` como secrets del Worker, habilita el correo del primer admin en su política Allow y configura los secretos de GitHub Actions. Nunca guardes el API token en Git, `.dev.vars`, `wrangler.jsonc` ni en variables públicas del frontend.

## Comandos

```powershell
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm deploy:staging
pnpm deploy:production
```

## Respaldo y restauración

La exportación semanal a R2 corresponde a la Fase 2. Como contingencia actual, Cloudflare D1 mantiene Time Travel cuando está disponible en el plan. Para restaurar una copia puntual, abre la base en el dashboard de Cloudflare D1 y usa **Restore** en Time Travel; selecciona la fecha y hora verificadas antes de confirmar. Después valida el resumen y los registros recientes. Antes de habilitar restauraciones de R2 se documentará el formato y el procedimiento de validación.

## Datos semilla

No se incluye el seed provisional de clientes, servidores, equipos ni SIM de la especificación. Esperamos la información confirmada para evitar cargar valores incorrectos. Las licencias empiezan vacías.
