-- NOM-COLAB · Modulo Gestion de cuentas (usuarios, sesiones y preferencias).
-- Azure SQL Database (SQL Server). Mismas tablas que schema-h2.sql.
-- Se ejecuta en cada arranque; todo es idempotente.

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
    color             VARCHAR(9)    NOT NULL
);

-- Bases de antes: ya no hay administrador general (cada cuenta controla sus espacios),
-- asi que se quitan la columna id_rol (con su llave foranea y su valor por defecto, cuyos
-- nombres los puso SQL Server) y la tabla rol. Las cuentas se conservan. El bloque va
-- dentro de una cadena para que el separador de sentencias (;) no lo parta.
IF COL_LENGTH(N'dbo.usuario', N'id_rol') IS NOT NULL
EXEC sp_executesql N'DECLARE @s NVARCHAR(MAX) = N''''; SELECT @s = @s + N''ALTER TABLE dbo.usuario DROP CONSTRAINT '' + QUOTENAME(o.name) + N''; '' FROM sys.objects o WHERE o.parent_object_id = OBJECT_ID(N''dbo.usuario'') AND (o.object_id IN (SELECT fc.constraint_object_id FROM sys.foreign_key_columns fc JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id WHERE fc.parent_object_id = OBJECT_ID(N''dbo.usuario'') AND c.name = N''id_rol'') OR o.object_id IN (SELECT c.default_object_id FROM sys.columns c WHERE c.object_id = OBJECT_ID(N''dbo.usuario'') AND c.name = N''id_rol'')); EXEC (@s); ALTER TABLE dbo.usuario DROP COLUMN id_rol;';

IF OBJECT_ID(N'dbo.rol', N'U') IS NOT NULL
DROP TABLE dbo.rol;

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

-- Noviembre 2026: cuentas de invitado (entran con apodo y QR, ligadas a un espacio) y el código
-- para recuperar la contraseña (solo su hash con sal). La página entra como nomcolab_app, que no
-- tiene ALTER: ahí el intento falla en silencio (TRY/CATCH) y la página sigue funcionando, con esos
-- datos aparte, hasta que "./desplegar.sh roles" corra este archivo con el administrador.
IF COL_LENGTH(N'dbo.usuario', N'invitado_de') IS NULL
EXEC sp_executesql N'BEGIN TRY ALTER TABLE dbo.usuario ADD invitado_de VARCHAR(16) NULL, hash_recuperacion VARCHAR(64) NULL, sal_recuperacion VARCHAR(32) NULL END TRY BEGIN CATCH END CATCH';

-- 13 de noviembre de 2026 (fase 13): alias, cuentas de la nube y aceptación de términos, como JSON.
IF COL_LENGTH(N'dbo.usuario', N'extra') IS NULL
EXEC sp_executesql N'BEGIN TRY ALTER TABLE dbo.usuario ADD extra NVARCHAR(MAX) NULL END TRY BEGIN CATCH END CATCH';
