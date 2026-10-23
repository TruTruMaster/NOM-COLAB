-- NOM-COLAB · Seguridad con roles en Azure SQL Database (como la práctica 7: usuarios, GRANT y roles).
--
-- El administrador del servidor (nomadmin) solo se usa para crear y cambiar tablas. La página se
-- conecta con un usuario que recibe sus privilegios por un ROL, no uno por uno:
--
--   rol_nomcolab_app      SELECT, INSERT, UPDATE y DELETE en usuario, sesion y preferencias.
--                         Nada de CREATE, ALTER ni DROP: si alguien se apodera de la conexión de
--                         la página, no puede borrar ni cambiar la estructura de la base.
--     nomcolab_app        el usuario con el que se conecta la Web App.
--
--   rol_nomcolab_consulta solo lectura, y sin las columnas de la contraseña (hash_contrasena, sal):
--                         para revisar las cuentas sin poder ver ni cambiar credenciales.
--                         (Por eso SELECT * o COUNT(*) sobre usuario se niegan: piden todas las
--                         columnas. Se nombran las columnas: SELECT nombre, empresa ..., COUNT(id).)
--     nomcolab_lector     el usuario para consultas (equipo, profesor).
--
-- Son usuarios contenidos de la base (no del servidor): entran solo a la base nomcolab.
-- Las contraseñas no van aquí: desplegar.sh reemplaza {{APP_PASS}} y {{LECTOR_PASS}} al aplicarlo.
-- Todo es idempotente: se puede correr de nuevo para actualizar privilegios o contraseñas.
-- (Los IF ... ELSE no llevan ; antes del ELSE porque el ; separa las sentencias al aplicarlo.)

IF DATABASE_PRINCIPAL_ID(N'rol_nomcolab_app') IS NULL
CREATE ROLE rol_nomcolab_app;

IF DATABASE_PRINCIPAL_ID(N'rol_nomcolab_consulta') IS NULL
CREATE ROLE rol_nomcolab_consulta;

-- Privilegios del rol de la página: solo datos, tabla por tabla.
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.usuario      TO rol_nomcolab_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.sesion       TO rol_nomcolab_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.preferencias TO rol_nomcolab_app;

-- Privilegios del rol de consulta: lectura por columnas (las de la contraseña quedan fuera).
GRANT SELECT ON dbo.usuario (id, nombre, nombre_clave, empresa, intentos_fallidos, bloqueado_hasta, creado, color) TO rol_nomcolab_consulta;
GRANT SELECT ON dbo.preferencias TO rol_nomcolab_consulta;

-- Usuarios: se crean sin ningún privilegio propio y lo reciben todo por el rol.
IF DATABASE_PRINCIPAL_ID(N'nomcolab_app') IS NULL
CREATE USER nomcolab_app WITH PASSWORD = N'{{APP_PASS}}'
ELSE
ALTER USER nomcolab_app WITH PASSWORD = N'{{APP_PASS}}';

IF DATABASE_PRINCIPAL_ID(N'nomcolab_lector') IS NULL
CREATE USER nomcolab_lector WITH PASSWORD = N'{{LECTOR_PASS}}'
ELSE
ALTER USER nomcolab_lector WITH PASSWORD = N'{{LECTOR_PASS}}';

-- Asignar el rol (como GRANT BECARIO TO ALEJANDRO en Oracle). Si mañana hay otro lector,
-- basta con CREATE USER y esta misma línea con su nombre.
IF IS_ROLEMEMBER(N'rol_nomcolab_app', N'nomcolab_app') = 0
ALTER ROLE rol_nomcolab_app ADD MEMBER nomcolab_app;

IF IS_ROLEMEMBER(N'rol_nomcolab_consulta', N'nomcolab_lector') = 0
ALTER ROLE rol_nomcolab_consulta ADD MEMBER nomcolab_lector;
