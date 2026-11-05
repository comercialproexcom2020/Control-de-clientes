# Control de clientes, equipos, SIM y licencias

Aplicación para PROEXCOM. La interfaz está en español de Colombia y el despliegue objetivo usa Cloudflare Workers, D1, React y Cloudflare Access.

## Estado

Estructura inicial de la Fase 1. Incluye el esquema D1, validación criptográfica del JWT de Access, protección por rol, una pantalla inicial conectada al resumen y pruebas de reglas de fechas. Los datos de negocio y despliegues no se configuran hasta recibir los valores reales.

## Requisitos

- Node.js 22 o superior y pnpm.
- Cuenta Cloudflare con Workers, D1 y Zero Trust/Access.
- Cuenta GitHub y repositorio privado para activar CI/CD.

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

1. Crea dos bases D1: `control-clientes-staging` y `control-clientes-production`.
2. Sustituye `REEMPLAZAR_CON_ID_D1_STAGING` y `REEMPLAZAR_CON_ID_D1_PRODUCTION` en `wrangler.jsonc` por los IDs entregados por Cloudflare. Estos identificadores no son secretos.
3. Aplica las migraciones:

```powershell
pnpm db:migrate:local
pnpm db:migrate:staging
pnpm db:migrate:production
```

4. Define `FIRST_ADMIN_EMAIL` en la sesión de PowerShell y ejecuta el seed idempotente:

```powershell
$env:FIRST_ADMIN_EMAIL = 'admin@tu-dominio.com'
pnpm seed:admin:local
# Cambia local por staging o production cuando corresponda.
```

El seed solo añade o reactiva ese correo con rol `admin`; no incluye contraseñas ni tokens. Agrega también ese correo a la política Allow de Cloudflare Access.

## GitHub Actions y despliegue

Configura en el repositorio privado los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. El token necesita permisos de Workers Scripts, D1 y acceso a la cuenta adecuada. Protege `main` y exige que pase el workflow CI. El workflow de despliegue publica producción al hacer push/merge a `main`; staging se puede desplegar manualmente desde Actions.

Antes del primer despliegue confirma los IDs D1, las variables `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD`, y el dominio con Access activo. Nunca guardes el API token en Git, `.dev.vars`, `wrangler.jsonc` ni en variables públicas del frontend.

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
