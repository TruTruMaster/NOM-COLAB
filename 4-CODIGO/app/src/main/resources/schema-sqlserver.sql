-- NOM-COLAB · Modulo Gestion de cuentas (usuarios, roles, sesiones y preferencias).
-- Azure SQL Database (SQL Server). Mismas tablas que schema-h2.sql.
-- Se ejecuta en cada arranque; todo es idempotente.

IF OBJECT_ID(N'dbo.rol', N'U') IS NULL
CREATE TABLE dbo.rol (
    id          INT           PRIMARY KEY,
    nombre      VARCHAR(20)   NOT NULL UNIQUE,
    descripcion NVARCHAR(160) NOT NULL
);

IF OBJECT_ID(N'dbo.usuario', N'U') IS NULL
CREATE TABLE dbo.usuario (
    id                VARCHAR(16)   PRIMARY KEY,
    nombre            NVARCHAR(24)  NOT NULL,
    nombre_clave      NVARCHAR(24)  NOT NULL UNIQUE,
    empresa           NVARCHAR(120) NULL,
    hash_contrasena   VARCHAR(64)   NOT NULL,
    sal               VARCHAR(32)   NOT NULL,
    intentos_fallidos INT           NOT NULL DEFAULT 0,
    bloqueado_hasta   BIGINT        NOT NULL DEFAULT 0,
    creado            BIGINT        NOT NULL,
    color             VARCHAR(9)    NOT NULL,
    id_rol            INT           NOT NULL DEFAULT 2 REFERENCES dbo.rol(id)
);

IF OBJECT_ID(N'dbo.preferencias', N'U') IS NULL
CREATE TABLE dbo.preferencias (
    id_usuario          VARCHAR(16) PRIMARY KEY REFERENCES dbo.usuario(id) ON DELETE CASCADE,
    tema                VARCHAR(6)  NOT NULL DEFAULT 'auto',
    autoguardado_min    INT         NOT NULL DEFAULT 5,
    versiones_conservar INT         NOT NULL DEFAULT 30,
    calidad             VARCHAR(4)  NOT NULL DEFAULT 'alta',
    movimiento_reducido BIT         NOT NULL DEFAULT 0,
    enfoque_atenuar     BIT         NOT NULL DEFAULT 1,
    idioma              VARCHAR(5)  NOT NULL DEFAULT 'es'
);

IF OBJECT_ID(N'dbo.sesion', N'U') IS NULL
CREATE TABLE dbo.sesion (
    token      VARCHAR(64) PRIMARY KEY,
    id_usuario VARCHAR(16) NOT NULL REFERENCES dbo.usuario(id) ON DELETE CASCADE,
    creada     BIGINT      NOT NULL,
    expira     BIGINT      NOT NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_sesion_usuario')
CREATE INDEX ix_sesion_usuario ON dbo.sesion(id_usuario);

IF NOT EXISTS (SELECT 1 FROM dbo.rol WHERE id = 1)
INSERT INTO dbo.rol (id, nombre, descripcion)
VALUES (1, 'ADMINISTRADOR', N'Administra las cuentas: ve a todos los usuarios, cambia su rol y desbloquea cuentas');

IF NOT EXISTS (SELECT 1 FROM dbo.rol WHERE id = 2)
INSERT INTO dbo.rol (id, nombre, descripcion)
VALUES (2, 'USUARIO', N'Crea espacios y documentos y colabora en los espacios donde tiene acceso');
