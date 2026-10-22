-- NOM-COLAB · Modulo Gestion de cuentas (usuarios, roles, sesiones y preferencias).
-- H2 embebido: el equipo que comparte el espacio en la red local.
-- La version para Azure SQL Database es schema-sqlserver.sql (mismas tablas).
-- Se ejecuta en cada arranque; todo es idempotente.

CREATE TABLE IF NOT EXISTS rol (
    id          INT          PRIMARY KEY,
    nombre      VARCHAR(20)  NOT NULL UNIQUE,
    descripcion VARCHAR(160) NOT NULL
);

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
    color             VARCHAR(9)   NOT NULL,
    id_rol            INT          DEFAULT 2 NOT NULL REFERENCES rol(id)
);

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

MERGE INTO rol (id, nombre, descripcion) KEY (id) VALUES
    (1, 'ADMINISTRADOR', 'Administra las cuentas: ve a todos los usuarios, cambia su rol y desbloquea cuentas'),
    (2, 'USUARIO',       'Crea espacios y documentos y colabora en los espacios donde tiene acceso');
