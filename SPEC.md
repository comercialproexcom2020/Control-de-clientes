# Control de Clientes, SIM cards, Equipos y Licencias — Especificación para Codex

> Documento de handoff. Pégalo completo a Codex (o guárdalo como `SPEC.md` en la raíz del repo y pídele que lo lea primero).
> Adjunto también `control_sims.html`: es un **prototipo visual** ya funcional (con otra base de datos). Úsalo como referencia de pantallas y reglas, **no como código base**.

---

## 0. Instrucciones para el agente (Codex)

1. Lee este documento completo antes de escribir código.
2. Trabaja por **fases** (sección 12). Termina y verifica una fase antes de empezar la siguiente.
3. No inventes reglas de negocio. Si algo no está definido aquí, elige la opción más simple, déjala anotada en `DECISIONES.md` y continúa.
4. Nunca guardes secretos, contraseñas ni tokens en el repositorio.
5. Toda la interfaz va **en español (Colombia)**. El código, los nombres de tablas y variables van en español sin tildes ni ñ (ej. `fecha_vence`, `bitacora`), como en el esquema de abajo.
6. Verifica en la documentación oficial vigente de Cloudflare los nombres exactos de configuración (`wrangler.jsonc`, bindings de D1, Cron Triggers, Workers Static Assets, Access), porque cambian con el tiempo.
7. Escribe pruebas para las reglas de negocio (sección 5). Nada se da por terminado sin pruebas pasando.

---

## 1. Contexto del negocio

El usuario vende y administra **radios PoC (Push-to-Talk over Cellular)** y sus **licencias** a **múltiples clientes** en Colombia. Cada radio usa una **SIM card** de **Tigo, Claro o Movistar**. Hoy todo se lleva en Excel y se pierde el control:

- No sabe a qué equipo puso cada SIM.
- No sabe cuáles SIM están en inventario, en uso, dañadas o por reemplazar.
- No hay bitácora de seguimiento.
- Las licencias se venden por **paquetes de 3, 6 o 12 meses** (a veces 1 o 24), a veces **con SIM** y a veces **sin SIM**, y necesita saber cuándo vencen y cuándo las renovó.
- La empresa maneja **varios servidores**, cada uno con su **IP o dominio y su puerto**. Cada equipo se conecta a uno de ellos, y los equipos de un mismo cliente pueden estar repartidos en servidores distintos.

**Objetivo:** una app web en línea, usable desde celular y computador, que sea la única fuente de verdad.

**Usuarios:** 1 dueño (admin) y quizá 1–3 colaboradores. No es multi-empresa (una sola organización).

---

## 2. Stack técnico (decisión ya tomada)

| Capa | Tecnología |
|---|---|
| Hosting + API | **Cloudflare Workers** (TypeScript) con framework **Hono** |
| Base de datos | **Cloudflare D1** (SQLite) con migraciones versionadas |
| Frontend | **React + Vite + TypeScript + Tailwind**, servido con **Workers Static Assets** desde el mismo Worker |
| Autenticación | **Cloudflare Access** (Zero Trust) delante de la app. El Worker **debe validar** el JWT del header `Cf-Access-Jwt-Assertion` contra las llaves públicas del equipo de Access; no confiar solo en el header de email |
| Autorización | Tabla `usuarios` (email → rol) consultada en el Worker |
| Tareas programadas | **Cron Triggers** de Workers (alertas diarias y respaldo semanal) |
| Correo de alertas | **Resend** (o proveedor equivalente) con la API key como **secret** del Worker |
| Respaldos | Export semanal a **R2** + **D1 Time Travel** como red de seguridad adicional |
| Validación | **zod** en todas las entradas de la API |
| Pruebas | **Vitest** (con el pool de Workers de Cloudflare para probar contra D1 local) |
| Código | **GitHub** (repo privado), rama `main` protegida |
| CI/CD | **GitHub Actions**: lint + typecheck + tests en cada PR; deploy con `wrangler` al hacer merge a `main` |
| Zona horaria | `America/Bogota` para toda regla basada en fechas |

Dos entornos: `staging` y `production` (cada uno con su propia base D1).

### Estructura sugerida del repo

```
/
├─ AGENTS.md              # reglas para Codex (resumen de la sección 0)
├─ SPEC.md                # este documento
├─ DECISIONES.md          # decisiones que tome el agente
├─ wrangler.jsonc
├─ package.json
├─ migrations/            # 0001_init.sql, 0002_...
├─ seed/                  # datos iniciales (sección 11)
├─ src/
│  ├─ worker/             # Hono: rutas, auth, reglas, cron
│  └─ web/                # React + Vite
├─ test/
└─ .github/workflows/     # ci.yml, deploy.yml
```

---

## 3. Modelo de datos (D1 / SQLite)

Usa estas tablas como punto de partida (`migrations/0001_init.sql`). Fechas como texto ISO `YYYY-MM-DD`; marcas de tiempo como ISO 8601 UTC.

```sql
CREATE TABLE servidores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,      -- ej. "Servidor A"
  host TEXT NOT NULL,        -- IP o dominio
  puerto TEXT NOT NULL,
  plataforma TEXT,           -- software/plataforma PoC (opcional)
  ubicacion TEXT,            -- proveedor o sitio (opcional)
  capacidad INTEGER,         -- máximo de equipos (opcional)
  notas TEXT,                -- NUNCA guardar contraseñas
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (host, puerto)      -- mismo host con otro puerto = otro servidor
);

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  responsable_comercial TEXT NOT NULL,
  nit TEXT, contacto TEXT, telefono TEXT, email TEXT,
  ciudad TEXT, direccion TEXT,
  servidor_id INTEGER REFERENCES servidores(id) ON DELETE SET NULL, -- servidor por defecto (opcional)
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  nombre TEXT,               -- ej. ETM1 (usuario/alias del radio)
  marca TEXT, modelo TEXT,
  imei TEXT UNIQUE,
  serial TEXT,
  estado TEXT NOT NULL DEFAULT 'En bodega'
    CHECK (estado IN ('Activo','En bodega','Dañado','Reemplazar','Baja')),
  fecha_envio TEXT,
  servidor_id INTEGER REFERENCES servidores(id) ON DELETE SET NULL, -- servidor al que se conecta este radio
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE sims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iccid TEXT NOT NULL UNIQUE,
  operador TEXT CHECK (operador IN ('Tigo','Claro','Movistar') OR operador IS NULL),
  numero_linea TEXT,
  estado TEXT NOT NULL DEFAULT 'Inventario'
    CHECK (estado IN ('Inventario','En uso','Dañada','Reemplazar','Baja')),
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  fecha_activacion TEXT,
  plan_nombre TEXT,
  plan_vence TEXT,           -- vencimiento del plan de datos de la SIM
  costo_mensual INTEGER,     -- COP
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
-- Un equipo solo puede tener UNA SIM asignada a la vez:
CREATE UNIQUE INDEX ux_sims_equipo ON sims(equipo_id) WHERE equipo_id IS NOT NULL;

CREATE TABLE licencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto TEXT NOT NULL,
  meses INTEGER NOT NULL CHECK (meses IN (1,3,6,12,24)),
  fecha_inicio TEXT NOT NULL,
  fecha_vence TEXT NOT NULL,
  incluye_sim INTEGER NOT NULL DEFAULT 0,
  sim_id INTEGER REFERENCES sims(id) ON DELETE SET NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  precio INTEGER,            -- COP, del periodo vigente
  pagada INTEGER NOT NULL DEFAULT 0,
  anulada INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE renovaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL REFERENCES licencias(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,       -- cuándo se renovó
  meses INTEGER NOT NULL,
  desde TEXT NOT NULL,       -- base de cálculo usada
  vence TEXT NOT NULL,       -- nuevo vencimiento
  precio INTEGER,
  pagada INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  usuario TEXT
);

CREATE TABLE bitacora (       -- append-only: nunca UPDATE ni DELETE
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  usuario TEXT NOT NULL,     -- email de Access
  entidad TEXT NOT NULL,     -- 'cliente'|'equipo'|'sim'|'licencia'|'sistema'
  entidad_id INTEGER,
  accion TEXT NOT NULL,      -- 'crear'|'editar'|'eliminar'|'asignar'|'reemplazar'|'renovar'|'importar'...
  detalle TEXT NOT NULL      -- texto legible, ej. "Estado: En uso → Dañada"
);
CREATE INDEX ix_bitacora_entidad ON bitacora(entidad, entidad_id, ts);

CREATE TABLE usuarios (
  email TEXT PRIMARY KEY,
  rol TEXT NOT NULL CHECK (rol IN ('admin','editor','lector')),
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE config (
  clave TEXT PRIMARY KEY, valor TEXT NOT NULL
);
-- claves: dias_alerta_licencia ("30,15,7"), emails_alerta, moneda ("COP")
```

Crea índices adicionales según las consultas reales (por `cliente_id`, `servidor_id`, `estado`, `fecha_vence`).

---

## 4. Roles y permisos

| Rol | Puede |
|---|---|
| `lector` | Ver todo. No modificar nada. |
| `editor` | Crear/editar clientes, equipos, SIM, licencias; renovar; reemplazar SIM; importar. **No** eliminar ni administrar usuarios. |
| `admin` | Todo lo anterior + eliminar + administrar usuarios y configuración + ver precios/costos. |

- Un email que pase Cloudflare Access pero **no esté en `usuarios`** recibe 403.
- El primer admin se crea con un script/migración de seed usando un email dado por variable de entorno.
- Los campos de **precio, pago y costo** solo los ven `admin` (decisión por defecto; documentar en `DECISIONES.md` si se cambia).

---

## 5. Reglas de negocio (obligatorias, con pruebas)

### 5.1 SIM cards
- Estados: `Inventario`, `En uso`, `Dañada`, `Reemplazar`, `Baja`.
- Una SIM solo puede estar asignada a **un equipo** y un equipo tiene **una SIM** a la vez (índice único).
- Al asignar una SIM a un equipo:
  - si estaba en `Inventario` → pasa a `En uso`;
  - si la SIM no tiene cliente, toma el `cliente_id` del equipo.
- Al quitar el equipo de una SIM `En uso` → vuelve a `Inventario` (a menos que el usuario indique otro estado, como `Dañada`).
- No se puede asignar a un equipo una SIM en estado `Dañada`, `Reemplazar` o `Baja`.
- Cada cambio de estado, cliente o equipo se registra en la bitácora con el valor anterior y el nuevo.

### 5.2 Reemplazo de SIM dañada (operación atómica)
`POST /api/equipos/:id/reemplazar-sim` con `{ sim_nueva_id, estado_sim_vieja ('Dañada'|'Reemplazar'|'Baja'), motivo }`:
1. La SIM vieja queda sin equipo y con el estado indicado.
2. La SIM nueva (debe estar en `Inventario`) se asigna al equipo y pasa a `En uso`.
3. Si hay licencias con `sim_id` apuntando a la SIM vieja en ese equipo, se actualizan a la nueva.
4. Todo en **una sola transacción** (`db.batch`) y **una entrada de bitácora** con el motivo.

### 5.3 Licencias
- `fecha_vence = fecha_inicio + meses` con **suma de meses de calendario**; si el día no existe en el mes destino, se usa el último día del mes (ej. 31-ene + 1 mes = 28/29-feb).
- **Estado calculado** (no se guarda), con fecha actual en `America/Bogota`:
  - `Anulada` si `anulada = 1`.
  - `Vencida` si `fecha_vence < hoy`.
  - `Por vencer` si faltan **30 días o menos** (valor configurable).
  - `Activa` en los demás casos.
- `incluye_sim = 1` es informativo y permite ligar `sim_id`; `incluye_sim = 0` no exige SIM.
- **Renovar** (`POST /api/licencias/:id/renovar` con `{ meses, precio?, pagada?, notas? }`):
  - base = `fecha_vence` si todavía no venció (hoy ≤ vence); si ya venció, base = hoy;
  - `nuevo_vence = base + meses`;
  - inserta fila en `renovaciones`, actualiza la licencia (`fecha_vence`, `meses`, `precio`, `pagada`), registra bitácora. Todo atómico.
- Una licencia anulada no se puede renovar (debe reactivarse primero).

### 5.4 Clientes
- El servidor del cliente (`servidor_id`) es solo un valor **por defecto**: al crear un equipo nuevo de ese cliente se prellena con él, pero cada equipo puede conectarse a otro servidor.
- Eliminar un cliente con equipos/SIM/licencias: **bloquear** y pedir desactivarlo (`activo = 0`) o reasignar. Solo `admin` elimina, y solo clientes sin registros.

### 5.5 Bitácora
- **Append-only**. Ninguna ruta la edita ni la borra.
- Registra: quién (email), cuándo, entidad, acción y detalle legible en español.
- Cada ficha (cliente, equipo, SIM, licencia) muestra su historial filtrado.

### 5.6 Servidores
- Un servidor es un par **host + puerto** único. El mismo host con otro puerto cuenta como otro servidor.
- Cada equipo tiene **0 o 1** servidor (`equipos.servidor_id`), definido en el propio equipo.
- **Mover equipos** (`POST /api/servidores/:id/mover-equipos` con `{ equipo_ids, servidor_destino_id, motivo }`): atómico (`db.batch`), con una entrada de bitácora por equipo ("Servidor: A → B").
- Si el servidor tiene `capacidad` y se supera al asignar o mover equipos, mostrar **advertencia** (no bloquear).
- No se puede eliminar un servidor con equipos o clientes asociados: se **desactiva** (`activo = 0`). Los servidores inactivos no aparecen en los selectores de formularios nuevos.
- Cambiar el host o el puerto de un servidor se registra en bitácora indicando cuántos equipos quedan afectados.
- No se guardan contraseñas de servidores.

---

## 6. API (REST, JSON, prefijo `/api`)

Todas validadas con zod, con paginación (`?page=&limit=`), búsqueda (`?q=`) y filtros.

| Recurso | Rutas |
|---|---|
| Clientes | `GET/POST /clientes`, `GET/PATCH /clientes/:id`, `DELETE /clientes/:id` (admin) |
| Servidores | `GET/POST /servidores`, `GET/PATCH /servidores/:id`, `POST /servidores/:id/mover-equipos`, `DELETE /servidores/:id` (admin, solo sin equipos) |
| Equipos | `GET/POST /equipos`, `GET/PATCH /equipos/:id`, `POST /equipos/:id/reemplazar-sim` |
| SIM | `GET/POST /sims`, `GET/PATCH /sims/:id`, `POST /sims/importar` |
| Licencias | `GET/POST /licencias`, `GET/PATCH /licencias/:id`, `POST /licencias/:id/renovar` |
| Bitácora | `GET /bitacora?entidad=&entidad_id=&desde=&hasta=&usuario=` |
| Resúmenes | `GET /resumen` (contadores), `GET /renovaciones/mes?mes=YYYY-MM` |
| Exportar | `GET /exportar.xlsx` (admin/editor), `GET /clientes/:id/reporte` (HTML imprimible) |
| Usuarios/Config | `GET/POST/PATCH /usuarios`, `GET/PATCH /config` (admin) |

Errores en JSON `{ error, detalle }` con códigos HTTP correctos. Mensajes en español.

---

## 7. Pantallas (frontend)

Diseño **mobile-first** (se usará mucho desde el celular), con modo claro/oscuro automático. Referencia visual: `control_sims.html`.

1. **Inicio / Resumen:** tarjetas con: clientes, licencias por vencer (30 d), vencidas, SIM en inventario, en uso, dañadas, por reemplazar. Cada tarjeta lleva a la lista filtrada.
2. **Clientes:** lista con búsqueda; columnas nombre, contacto, teléfono, servidor por defecto, # equipos, # SIM, próximo vencimiento.
3. **Ficha de cliente:** datos editables + listas de licencias, equipos y SIM del cliente, con botones "+ Licencia", "+ Equipo", "+ SIM" que abren el formulario con el cliente ya puesto + historial.
4. **Licencias:** lista ordenada por vencimiento ascendente; chip de estado (Activa / Por vencer / Vencida / Anulada); filtros. Formulario: al cambiar **duración** o **inicio**, el vencimiento se recalcula solo (editable). Botón **Renovar** con selector de meses e historial de renovaciones.
5. **SIM cards:** lista con filtros por estado, operador y cliente; búsqueda por ICCID. Formulario de alta y edición.
6. **Equipos:** lista con la SIM asignada y el `servidor:puerto` al que se conecta; filtro por servidor; botón **Reemplazar SIM** (flujo de la 5.2).
7. **Renovaciones del mes:** lo que vence en el mes elegido, agrupado por cliente, con total a cobrar (solo admin) y botón "Copiar mensaje de WhatsApp".
8. **Bitácora:** línea de tiempo global con filtros.
9. **Importar / Exportar:** (ver sección 9).
10. **Administración (admin):** usuarios y roles, días de alerta, correos de alerta.
11. **Servidores:** lista (nombre, host, puerto, plataforma, # equipos, # clientes, uso de capacidad); ficha con los equipos conectados agrupados por cliente; acción **Mover equipos** a otro servidor con selección múltiple. Los selectores de servidor en cliente y equipo muestran `nombre — host:puerto`.

Requisitos de UX: tablas con scroll horizontal en móvil, formularios en pantalla completa en móvil, confirmaciones antes de eliminar, estados de carga y de error visibles, y accesibilidad básica (etiquetas, contraste, navegación por teclado).

---

## 8. Alertas y tareas programadas (Cron Triggers)

- **Diaria (7:00 a. m. hora Colombia):** correo a `emails_alerta` con licencias que vencen en **30, 15 y 7 días** (según `dias_alerta_licencia`) y las que **vencieron en los últimos 7 días**, agrupadas por cliente. Si no hay nada, **no enviar** correo. Incluir también SIM con `plan_vence` próximo.
- **Semanal (domingo):** respaldo completo a R2 en `respaldos/AAAA-MM-DD.json` (todas las tablas) y limpieza de respaldos con más de 12 semanas.
- Cada ejecución registra una fila de bitácora (`entidad = 'sistema'`) con el resultado o el error.
- Recordar que los cron de Cloudflare corren en **UTC**: convertir 7:00 a. m. Bogotá (UTC-5) a la expresión cron correcta.

**Mensaje de WhatsApp para el cliente** (texto de plantilla editable en `config`):
> Hola {contacto}, le recordamos que su licencia {producto} ({meses} meses) vence el {fecha_vence}. ¿Desea que le gestionemos la renovación?

La app solo **copia** el texto o abre `https://wa.me/57{telefono}?text=...`. No integra la API oficial de WhatsApp en la v1.

---

## 9. Importación y exportación

- **Importar inventario desde plantilla CSV UTF-8 descargable:** una fila por radio con cliente, responsable comercial, IP, puerto, alias, operador, ICCID, IMEI, marca, modelo, serial, fechas y observaciones. Mostrar **vista previa** con errores por fila (IMEI/ICCID duplicado, operador o fecha inválidos) antes de confirmar. Nada se guarda hasta confirmar. Agrupar servidores por la pareja `host + puerto`, y enlazar equipo y SIM de cada fila. Ignorar credenciales de acceso y datos no modelados. Registrar una sola entrada de bitácora resumen.
- **Exportar a Excel (.xlsx):** una hoja por tabla (servidores, clientes, equipos, SIM, licencias, renovaciones, bitácora). El admin ve precios; los demás roles, no.
- **Reporte por cliente:** página HTML con estilos de impresión (Imprimir → PDF) con datos del cliente, equipos con su SIM y su `servidor:puerto`, licencias y vencimientos.

---

## 10. Seguridad y calidad

- Cloudflare Access protege **todo** el dominio; el Worker valida el JWT (firma, `aud`, `iss`, expiración).
- Consultas D1 **siempre parametrizadas** (nunca concatenar SQL).
- Escapar todo texto que se pinte en HTML.
- Sin contraseñas almacenadas (ni de servidores ni de equipos).
- Cabeceras de seguridad (CSP, `X-Content-Type-Options`, etc.).
- Secrets solo en `wrangler secret` y en GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RESEND_API_KEY`.
- Pruebas obligatorias para: cálculo de fechas (incluye fin de mes y años bisiestos), estado calculado de licencias, renovación (vigente vs. vencida), asignación y reemplazo de SIM (incluye rollback), movimiento de equipos entre servidores, permisos por rol, y bitácora append-only.

---

## 11. Datos iniciales (seed)

Fuente: el Excel `EDIFICIO_TERRAZAS_DEL_MAR.xlsx` del usuario.

**Servidores** (provisionales; el usuario tiene varios y debe entregar la lista completa)

| nombre | host | puerto |
|---|---|---|
| Servidor A | 192.175.107.181 | 10023 |
| Servidor B | 192.175.107.164 | 10023 |

En el Excel las IP venían sin puntos (`192175107181`); se asumió ese formato. **Confirmar con el usuario.**

**Cliente**

| nombre | servidor por defecto | notas |
|---|---|---|
| PROEXCOM | Servidor A | Edificio Terrazas del Mar. |

**Equipos** (marca HYTERA, cliente PROEXCOM, estado Activo)

| nombre | modelo | IMEI | serial | SIM (ICCID) | servidor |
|---|---|---|---|---|---|
| ETM1 | PNC360 | 865418052130356 | 25912A2118 | 57101702506134140 | Servidor B |
| ETM2 | PNC361 | 865418052130349 | 25912A2117 | 57101702506134139 | Servidor A |
| ETM3 | PNC362 | 865418052130372 | 25912A2120 | 57101702506134138 | Servidor A |
| ETM4 | PNC363 | 865418052130331 | 25912A2116 | 57101702506134141 | Servidor A |
| ETM5 | PNC364 | 865418052130364 | 25912A2119 | 57101702506134142 | Servidor A |

Las 5 SIM asignadas: operador **Claro**, estado `En uso`, cliente PROEXCOM, `fecha_activacion` **2026-02-03** (en el Excel las fechas iban 2026–2030, parece error de arrastre; **confirmar**).

**SIM en inventario** (21, estado `Inventario`, sin cliente, **operador por definir**): ICCID consecutivos `57101602507872816` hasta `57101602507872836`.

**Licencias:** el Excel no traía licencias. Empezar con la tabla vacía.

Crea el seed como script SQL o JSON idempotente en `seed/` (no debe duplicar datos al correrse dos veces).

---

## 12. Fases de entrega

**Fase 1 — Base funcional (equivale al prototipo, pero seria)**
- Repo, CI/CD, entornos staging/producción, migraciones, seed.
- Auth con Access + roles.
- CRUD de servidores, clientes, equipos, SIM y licencias; reglas 5.1, 5.3, 5.4 y 5.6.
- Renovar licencias.
- Bitácora automática con usuario.
- Pantallas 1–6, 8 y 11 (Servidores).
- *Criterio de aceptación:* todas las pruebas de la sección 10 pasan; se puede recorrer en staging el flujo "crear servidor → crear cliente → crear equipo (con servidor) → asignar SIM → vender licencia → renovar".

**Fase 2 — Que la app avise y proteja**
- Reemplazo de SIM (5.2) y pantalla 7 (renovaciones del mes).
- Cron de alertas por correo y respaldo semanal a R2.
- Importar SIM por CSV y exportar a Excel.
- Plantilla de mensaje de WhatsApp.

**Fase 3 — Control del negocio**
- Precios, pagos pendientes, costo mensual de SIM por operador y margen.
- Vencimiento del plan de datos de la SIM con alertas.
- Reporte imprimible por cliente.
- Pantalla de administración (usuarios, configuración).

**Fase 4 — Comodidad**
- Escáner de IMEI/ICCID con la cámara del celular (API de detección de códigos de barras del navegador, con alternativa de captura manual si no está disponible).
- Adjuntar fotos o documentos (actas de entrega) a clientes y equipos usando R2.
- Instalar como PWA en el celular.

---

## 13. Lo que el usuario debe hacer él mismo (Codex no puede)

1. Crear cuenta de **Cloudflare** y de **GitHub** (repo privado).
2. Activar **Zero Trust / Access** y crear la aplicación protegida (Codex documenta los pasos exactos en `README.md`).
3. Crear el **API token** de Cloudflare con permisos para Workers, D1 y R2, y cargarlo en GitHub Secrets.
4. Crear cuenta en **Resend** (o equivalente) y verificar el dominio de envío.
5. Decidir el dominio (opcional: puede usar el subdominio `workers.dev` al inicio).
6. Responder las dudas de la sección 14.

## 14. Preguntas abiertas (resolver con el usuario antes o durante la Fase 1)

1. ¿Cuántos servidores tienen en total? Lista de cada uno con nombre, IP o dominio y puerto, y a cuál se conecta cada cliente o equipo (en el Excel de PROEXCOM aparecen dos IP: …164 y …181).
2. ¿Qué operador son las 21 SIM en inventario?
3. ¿Cuáles son las fechas de activación reales de las 5 SIM en uso?
4. ¿Cuántas personas usarán la app y con qué rol?
5. ¿Los colaboradores deben ver precios? (por defecto, no)
6. ¿Qué otros estados necesitan SIM y equipos (ej. "En garantía", "Suspendida")?
7. ¿Aparte de radios Hytera hay otros tipos de equipo que requieran campos distintos?
8. ¿Qué productos/licencias vende exactamente (nombres y duración típica)?
9. ¿A qué correo(s) llegan las alertas de vencimiento?

---

## 15. Definición de "terminado" (global)

- Desplegado en producción detrás de Cloudflare Access.
- CI verde y deploy automático desde `main`.
- `README.md` con: cómo correr en local, cómo hacer migraciones, cómo desplegar, cómo restaurar un respaldo y cómo agregar un usuario.
- Datos iniciales cargados y verificados por el usuario.
- `DECISIONES.md` actualizado con todo lo que se decidió sin consultar.
