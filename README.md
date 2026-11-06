# Control de clientes, equipos, SIM y licencias

Aplicación para PROEXCOM. La interfaz está en español de Colombia; se publica en Cloudflare Pages y la API corre en Pages Functions con D1. El acceso usa contraseña propia y no depende de Cloudflare Zero Trust/Access.

## Estado

Pages está conectado al repositorio `comercialproexcom2020/Control-de-clientes`. El proyecto quedó configurado con `pnpm build`, salida `dist`, D1 de staging en implementaciones de vista previa y D1 de producción en `main`. La función de API está en `functions/api/[[path]].ts`.

La migración `0002_autenticacion.sql` ya quedó aplicada en ambas D1. Falta provisionar la contraseña del admin y publicar la rama de vista previa. No se han cargado clientes, servidores, equipos, SIM ni licencias. La URL pública de Pages no debe usarse con datos reales hasta terminar esos pasos.

## Requisitos

- Node.js 22 o superior y pnpm.
- Cuenta Cloudflare con Pages y D1.
- Cuenta GitHub. El repositorio actual es público, así que no guardes secretos ni datos de negocio en el código.

## Desarrollo local

```powershell
pnpm install
pnpm db:migrate:local
$env:FIRST_ADMIN_EMAIL = 'admin@tu-dominio.com'
$contrasenaSegura = Read-Host 'Contraseña del admin' -AsSecureString
$env:FIRST_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $contrasenaSegura).Password
pnpm seed:admin:local
Remove-Item Env:FIRST_ADMIN_PASSWORD
$contrasenaSegura.Dispose()
pnpm dev
```

Usa una contraseña larga, única y de al menos 16 caracteres. La variable `FIRST_ADMIN_PASSWORD` solo se lee durante el seed; no la agregues a `.dev.vars` ni al repositorio. Vite sirve la interfaz en `http://localhost:5173` y reenvía `/api` al Worker local en el puerto 8787.

La app guarda en D1 únicamente un hash PBKDF2 de la contraseña. Las sesiones usan cookies `HttpOnly`, `SameSite=Lax`, se guardan como hash en D1 y vencen después de ocho horas. Cinco intentos incorrectos por correo y origen bloquean nuevos intentos durante 15 minutos. El correo debe estar activo en `usuarios`.

## Bases D1 y primer admin

Cada entorno usa su propia base D1: `control-clientes-staging` y `control-clientes-production`. Sus IDs están en `wrangler.jsonc`; no son secretos. El binding `DB` de Pages usa staging para vista previa y producción para la rama `main`.

La migración `0002_autenticacion.sql` ya está aplicada en staging y producción. Provisiona la contraseña del admin desde una terminal autenticada con Wrangler. Para iniciar sesión: `node .\node_modules\wrangler\bin\wrangler.js login`.

```powershell
$env:FIRST_ADMIN_EMAIL = 'comercialproexcom2020@gmail.com'
$contrasenaSegura = Read-Host 'Contraseña del admin' -AsSecureString
$env:FIRST_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $contrasenaSegura).Password
pnpm seed:admin:staging
pnpm seed:admin:production
Remove-Item Env:FIRST_ADMIN_PASSWORD
$contrasenaSegura.Dispose()
```

El seed reactiva el correo como `admin` y reemplaza el hash por uno con salt aleatorio; nunca imprime la contraseña. La gestión visual para crear colaboradores y restablecer contraseñas llegará en una fase posterior.

## Pages, GitHub y despliegue

Cloudflare Pages publica el frontend estático y ejecuta `/api/*` mediante Functions. Ya están configurados el comando `pnpm build`, el directorio `dist` y el binding D1 `DB` para staging (vista previa) y producción (`main`). Pages despliega automáticamente los commits de GitHub; una rama distinta de `main` crea una vista previa. Verifica la vista previa antes de integrar cambios en `main`.

No se necesita configurar Zero Trust ni agregar datos de pago. No publiques credenciales en GitHub. La autenticación no usa variables públicas ni secretos de Access.

## Comandos

```powershell
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate:local
pnpm db:migrate:staging
pnpm db:migrate:production
```

## Respaldo y restauración

La exportación semanal a R2 corresponde a la Fase 2. Como contingencia actual, Cloudflare D1 mantiene Time Travel cuando está disponible en el plan. Para restaurar una copia puntual, abre la base en el dashboard de Cloudflare D1 y usa **Restore** en Time Travel; selecciona la fecha y hora verificadas antes de confirmar. Después valida el resumen y los registros recientes. Antes de habilitar restauraciones de R2 se documentará el formato y el procedimiento de validación.

## Datos semilla

No se incluye el seed provisional de clientes, servidores, equipos ni SIM de la especificación. Esperamos la información confirmada para evitar cargar valores incorrectos. Las licencias empiezan vacías.
