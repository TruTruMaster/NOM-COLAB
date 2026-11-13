-- NOM-COLAB · Modulo Gestion de cuentas (usuarios, sesiones y preferencias).
-- H2 embebido: el equipo que comparte el espacio en la red local.
-- La version para Azure SQL Database es schema-sqlserver.sql (mismas tablas).
-- Se ejecuta en cada arranque; todo es idempotente.

CREATE TABLE IF NOT EXISTS usuario (
    id                VARCHAR(16)  PRIMARY KEY,
    nombre            VARCHAR(24)  NOT NULL,
    nombre_clave      VARCHAR(24)  NOT NULL UNIQUE,
    empresa           VARCHAR(120),
    hash_contrasena   VARCHAR(64)  NOT NULL,
    sal               VARCHAR(32)  NOT NULL,
    intentos_fallidos INT          DEFAULT 0 NOT NULL,
    bloqueado_hasta   BIGINT       DEFAULT 0 NOT NULL,
    creado            BIGINT       NOT NULL,
    color             VARCHAR(9)   NOT NULL
);

-- Bases de antes: ya no hay administrador general (cada cuenta controla sus espacios),
-- asi que se quitan la columna id_rol y la tabla rol. Las cuentas se conservan.
ALTER TABLE usuario DROP COLUMN IF EXISTS id_rol;
DROP TABLE IF EXISTS rol;

CREATE TABLE IF NOT EXISTS preferencias (
    id_usuario          VARCHAR(16) PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    tema                VARCHAR(6)  DEFAULT 'auto' NOT NULL,
    autoguardado_min    INT         DEFAULT 5 NOT NULL,
    versiones_conservar INT         DEFAULT 30 NOT NULL,
    calidad             VARCHAR(4)  DEFAULT 'alta' NOT NULL,
    movimiento_reducido BOOLEAN     DEFAULT FALSE NOT NULL,
    enfoque_atenuar     BOOLEAN     DEFAULT TRUE NOT NULL,
    idioma              VARCHAR(5)  DEFAULT 'es' NOT NULL
);

CREATE TABLE IF NOT EXISTS sesion (
    token      VARCHAR(64) PRIMARY KEY,
    id_usuario VARCHAR(16) NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    creada     BIGINT      NOT NULL,
    expira     BIGINT      NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sesion_usuario ON sesion(id_usuario);

-- Noviembre 2026: cuentas de invitado (entran con apodo y QR, ligadas a un espacio) y el código
-- para recuperar la contraseña (solo su hash con sal).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS invitado_de VARCHAR(16);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS hash_recuperacion VARCHAR(64);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS sal_recuperacion VARCHAR(32);

-- 13 de noviembre de 2026 (fase 13): alias sin contraseña, cuentas que llegan de la nube con un pase
-- firmado y qué versión de los términos aceptó cada cuenta. Van juntos como JSON en una sola columna.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS extra VARCHAR(16000);
