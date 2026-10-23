-- =====================================================================
-- NOM-COLAB — esquema de base de datos
-- Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7
--
-- Corresponde al diagrama 12-modelo-datos.
-- Dialecto: PostgreSQL. Para el nodo local embebido (SQLite / H2)
-- cambiar UUID -> TEXT, TIMESTAMP -> DATETIME y quitar los CHECK de enum
-- por tablas de dominio.
-- =====================================================================

-- ------------------------- CUENTAS -----------------------------------
-- Sin administrador general: cada cuenta controla sus espacios; los permisos viven en
-- la tabla acceso (por espacio). Lo implementado y desplegado en Azure SQL esta en
-- app/src/main/resources/schema-sqlserver.sql y schema-h2.sql.
CREATE TABLE usuario (
    id                UUID         PRIMARY KEY,
    nombre            VARCHAR(50)  NOT NULL UNIQUE,
    hash_contrasena   VARCHAR(255) NOT NULL,
    empresa           VARCHAR(120),
    intentos_fallidos SMALLINT     NOT NULL DEFAULT 0,
    bloqueado         BOOLEAN      NOT NULL DEFAULT FALSE,
    creado            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE preferencias (
    id_usuario       UUID        PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    idioma           VARCHAR(10) NOT NULL DEFAULT 'es',
    autoguardado_seg INT         NOT NULL DEFAULT 30  CHECK (autoguardado_seg > 0),
    limite_versiones INT         NOT NULL DEFAULT 50  CHECK (limite_versiones > 0),
    calidad_render   VARCHAR(10) NOT NULL DEFAULT 'alta'
                     CHECK (calidad_render IN ('baja','media','alta'))
);

CREATE TABLE sesion (
    token      VARCHAR(64) PRIMARY KEY,
    id_usuario UUID        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    inicio     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira     TIMESTAMP   NOT NULL,
    CHECK (expira > inicio)
);
CREATE INDEX ix_sesion_usuario ON sesion(id_usuario);

-- ------------------------- ESPACIOS ----------------------------------
CREATE TABLE espacio (
    id             UUID         PRIMARY KEY,
    nombre         VARCHAR(120) NOT NULL,
    id_propietario UUID         NOT NULL REFERENCES usuario(id),
    creado         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_propietario, nombre)
);

CREATE TABLE acceso (
    id_espacio UUID        NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    id_usuario UUID        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    permiso    VARCHAR(12) NOT NULL
               CHECK (permiso IN ('LECTURA','EDICION','PROPIETARIO')),
    otorgado   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_espacio, id_usuario)
);
CREATE INDEX ix_acceso_usuario ON acceso(id_usuario);

CREATE TABLE nodo (
    id         UUID        PRIMARY KEY,
    id_espacio UUID        NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    tipo       VARCHAR(12) NOT NULL CHECK (tipo IN ('WEB','ESCRITORIO','ANDROID')),
    host       VARCHAR(80) NOT NULL,
    puerto     INT         NOT NULL CHECK (puerto BETWEEN 1 AND 65535),
    ultima_vez TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_nodo_espacio ON nodo(id_espacio);

-- ------------------------- DOCUMENTOS --------------------------------
CREATE TABLE plantilla (
    id     UUID         PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    modo   VARCHAR(14)  NOT NULL
           CHECK (modo IN ('TEXTO','HOJA','PRESENTACION','DIAGRAMA'))
);

CREATE TABLE documento (
    id             UUID         PRIMARY KEY,
    id_espacio     UUID         NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    nombre         VARCHAR(160) NOT NULL,
    modo           VARCHAR(14)  NOT NULL
                   CHECK (modo IN ('TEXTO','HOJA','PRESENTACION','DIAGRAMA')),
    version_actual INT          NOT NULL DEFAULT 1,
    id_plantilla   UUID         REFERENCES plantilla(id)
);
CREATE INDEX ix_documento_espacio ON documento(id_espacio);

CREATE TABLE pagina (
    id           UUID PRIMARY KEY,
    id_documento UUID NOT NULL REFERENCES documento(id) ON DELETE CASCADE,
    indice       INT  NOT NULL,
    UNIQUE (id_documento, indice)
);

CREATE TABLE estilo (
    id          UUID        PRIMARY KEY,
    fuente      VARCHAR(60) NOT NULL,
    tamano      SMALLINT    NOT NULL CHECK (tamano > 0),
    color_texto CHAR(7)     NOT NULL,
    color_fondo CHAR(7)     NOT NULL
);

CREATE TABLE animacion (
    id          UUID        PRIMARY KEY,
    efecto      VARCHAR(40) NOT NULL,
    duracion_ms INT         NOT NULL CHECK (duracion_ms >= 0),
    orden       SMALLINT    NOT NULL DEFAULT 0
);

-- Herencia por tabla-por-subclase: "tipo" indica en cuál tabla hija
-- está el resto de los datos del bloque.
CREATE TABLE bloque (
    id           UUID          PRIMARY KEY,
    id_pagina    UUID          NOT NULL REFERENCES pagina(id) ON DELETE CASCADE,
    tipo         VARCHAR(8)    NOT NULL
                 CHECK (tipo IN ('TEXTO','TABLA','IMAGEN','FORMA')),
    x            NUMERIC(10,2) NOT NULL,
    y            NUMERIC(10,2) NOT NULL,
    ancho        NUMERIC(10,2) NOT NULL CHECK (ancho  >= 0),
    alto         NUMERIC(10,2) NOT NULL CHECK (alto   >= 0),
    z            INT           NOT NULL DEFAULT 0,
    id_estilo    UUID          REFERENCES estilo(id),
    id_animacion UUID          REFERENCES animacion(id),
    -- borrado lógico: el CRDT necesita recordar lo que se eliminó
    eliminado    BOOLEAN       NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_bloque_pagina ON bloque(id_pagina) WHERE eliminado = FALSE;

CREATE TABLE bloque_texto (
    id_bloque UUID PRIMARY KEY REFERENCES bloque(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL DEFAULT ''
);

CREATE TABLE bloque_tabla (
    id_bloque UUID PRIMARY KEY REFERENCES bloque(id) ON DELETE CASCADE,
    filas     INT  NOT NULL CHECK (filas    > 0),
    columnas  INT  NOT NULL CHECK (columnas > 0)
);

CREATE TABLE celda (
    id_bloque UUID NOT NULL REFERENCES bloque_tabla(id_bloque) ON DELETE CASCADE,
    fila      INT  NOT NULL CHECK (fila    >= 0),
    columna   INT  NOT NULL CHECK (columna >= 0),
    formula   TEXT,
    valor     TEXT,
    PRIMARY KEY (id_bloque, fila, columna)
);

CREATE TABLE bloque_imagen (
    id_bloque    UUID         PRIMARY KEY REFERENCES bloque(id) ON DELETE CASCADE,
    ruta_recurso VARCHAR(255) NOT NULL
);

CREATE TABLE bloque_forma (
    id_bloque UUID        PRIMARY KEY REFERENCES bloque(id) ON DELETE CASCADE,
    figura    VARCHAR(40) NOT NULL
);

-- ------------------------- VERSIONES ---------------------------------
CREATE TABLE version (
    id           UUID      PRIMARY KEY,
    id_documento UUID      NOT NULL REFERENCES documento(id) ON DELETE CASCADE,
    numero       INT       NOT NULL CHECK (numero > 0),
    id_autor     UUID      NOT NULL REFERENCES usuario(id),
    fecha        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_documento, numero)
);

-- ------------------------- CRDT --------------------------------------
CREATE TABLE operacion (
    id_operacion   VARCHAR(80) PRIMARY KEY,   -- idNodo + contador: idempotente
    id_documento   UUID        NOT NULL REFERENCES documento(id) ON DELETE CASCADE,
    id_bloque      UUID        REFERENCES bloque(id),
    tipo           VARCHAR(10) NOT NULL
                   CHECK (tipo IN ('INSERTAR','ACTUALIZAR','ELIMINAR','MOVER')),
    carga          TEXT,
    id_nodo_origen UUID        NOT NULL REFERENCES nodo(id),
    recibida       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aplicada       BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_operacion_documento ON operacion(id_documento, recibida);

-- El reloj vectorial se guarda como filas (una por nodo), no como blob:
-- así se puede comparar en SQL cuál operación precede a cuál.
CREATE TABLE reloj_marca (
    id_operacion VARCHAR(80) NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
    id_nodo      UUID        NOT NULL,
    contador     BIGINT      NOT NULL CHECK (contador >= 0),
    PRIMARY KEY (id_operacion, id_nodo)
);

-- Cola de salida para trabajar sin conexión (CU-26).
CREATE TABLE cola_pendiente (
    id              UUID        PRIMARY KEY,
    id_operacion    VARCHAR(80) NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
    id_nodo_destino UUID        NOT NULL REFERENCES nodo(id),
    intentos        SMALLINT    NOT NULL DEFAULT 0,
    creada          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_operacion, id_nodo_destino)
);
