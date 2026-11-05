PRAGMA foreign_keys = ON;

CREATE TABLE servidores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  host TEXT NOT NULL,
  puerto TEXT NOT NULL,
  plataforma TEXT,
  ubicacion TEXT,
  capacidad INTEGER,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (host, puerto)
);

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  nit TEXT,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  ciudad TEXT,
  direccion TEXT,
  servidor_id INTEGER REFERENCES servidores(id) ON DELETE SET NULL,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  nombre TEXT,
  marca TEXT,
  modelo TEXT,
  imei TEXT UNIQUE,
  serial TEXT,
  estado TEXT NOT NULL DEFAULT 'En bodega' CHECK (estado IN ('Activo','En bodega','Dañado','Reemplazar','Baja')),
  fecha_envio TEXT,
  servidor_id INTEGER REFERENCES servidores(id) ON DELETE SET NULL,
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE sims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iccid TEXT NOT NULL UNIQUE,
  operador TEXT CHECK (operador IN ('Tigo','Claro','Movistar') OR operador IS NULL),
  numero_linea TEXT,
  estado TEXT NOT NULL DEFAULT 'Inventario' CHECK (estado IN ('Inventario','En uso','Dañada','Reemplazar','Baja')),
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  fecha_activacion TEXT,
  plan_nombre TEXT,
  plan_vence TEXT,
  costo_mensual INTEGER,
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX ux_sims_equipo ON sims(equipo_id) WHERE equipo_id IS NOT NULL;

CREATE TABLE licencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto TEXT NOT NULL,
  meses INTEGER NOT NULL CHECK (meses IN (1,3,6,12,24)),
  fecha_inicio TEXT NOT NULL,
  fecha_vence TEXT NOT NULL,
  incluye_sim INTEGER NOT NULL DEFAULT 0 CHECK (incluye_sim IN (0,1)),
  sim_id INTEGER REFERENCES sims(id) ON DELETE SET NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  precio INTEGER,
  pagada INTEGER NOT NULL DEFAULT 0 CHECK (pagada IN (0,1)),
  anulada INTEGER NOT NULL DEFAULT 0 CHECK (anulada IN (0,1)),
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE renovaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL REFERENCES licencias(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  meses INTEGER NOT NULL CHECK (meses IN (1,3,6,12,24)),
  desde TEXT NOT NULL,
  vence TEXT NOT NULL,
  precio INTEGER,
  pagada INTEGER NOT NULL DEFAULT 0 CHECK (pagada IN (0,1)),
  notas TEXT,
  usuario TEXT
);

CREATE TABLE bitacora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  usuario TEXT NOT NULL,
  entidad TEXT NOT NULL CHECK (entidad IN ('cliente','equipo','sim','licencia','servidor','sistema')),
  entidad_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL
);
CREATE INDEX ix_bitacora_entidad ON bitacora(entidad, entidad_id, ts);
CREATE TRIGGER bitacora_no_update BEFORE UPDATE ON bitacora BEGIN SELECT RAISE(ABORT, 'bitacora es append-only'); END;
CREATE TRIGGER bitacora_no_delete BEFORE DELETE ON bitacora BEGIN SELECT RAISE(ABORT, 'bitacora es append-only'); END;

CREATE TABLE usuarios (
  email TEXT PRIMARY KEY,
  rol TEXT NOT NULL CHECK (rol IN ('admin','editor','lector')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
INSERT INTO config (clave, valor) VALUES
  ('dias_alerta_licencia', '30,15,7'),
  ('emails_alerta', ''),
  ('moneda', 'COP'),
  ('plantilla_whatsapp', 'Hola {contacto}, le recordamos que su licencia {producto} ({meses} meses) vence el {fecha_vence}. ¿Desea que le gestionemos la renovación?');

CREATE INDEX ix_clientes_servidor ON clientes(servidor_id);
CREATE INDEX ix_clientes_nombre ON clientes(nombre);
CREATE INDEX ix_equipos_cliente ON equipos(cliente_id);
CREATE INDEX ix_equipos_servidor ON equipos(servidor_id);
CREATE INDEX ix_equipos_estado ON equipos(estado);
CREATE INDEX ix_sims_cliente ON sims(cliente_id);
CREATE INDEX ix_sims_estado ON sims(estado);
CREATE INDEX ix_licencias_cliente ON licencias(cliente_id);
CREATE INDEX ix_licencias_vence ON licencias(fecha_vence);
CREATE INDEX ix_renovaciones_fecha ON renovaciones(fecha);
