ALTER TABLE usuarios ADD COLUMN password_hash TEXT;

CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES usuarios(email) ON DELETE CASCADE,
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL
);
CREATE INDEX ix_sesiones_email ON sesiones(email, expira_en);

CREATE TABLE intentos_login (
  clave TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL,
  ventana_inicio TEXT NOT NULL,
  bloqueado_hasta TEXT
);
