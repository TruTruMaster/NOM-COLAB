#!/usr/bin/env bash
# NOM-COLAB · despliegue en Azure (App Service + Azure SQL Database), todo gratis
# con la suscripción Azure for Students del IPN. Ver ../docs/DESPLIEGUE-AZURE.md.
#
#   ./desplegar.sh crear      # una sola vez: grupo, base de datos, plan, web app y variables
#   ./desplegar.sh roles      # después de crear (y cada vez que cambien las tablas): migra el
#                             # esquema con el administrador, crea los roles y usuarios de
#                             # roles-bd.sql, prueba los permisos y deja la página conectada
#                             # con nomcolab_app en vez del administrador
#   ./desplegar.sh subir      # cada vez que cambie el código: compila y sube el jar
#                             # (también lo hace solo GitHub Actions al subir a main)
#
# Las contraseñas NO van aquí: se leen de variables (export SQLPASS='...' para nomadmin;
# para "roles" además APP_PASS y LECTOR_PASS, las de nomcolab_app y nomcolab_lector).
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

RG=${RG:-rg-nomcolab}
LOC=${LOC:-westus}              # la política del IPN solo permite: westus, northcentralus,
                                # norwayeast, swedencentral, belgiumcentral
SQLSERVER=${SQLSERVER:-nomcolab-sql-6a073f}
SQLADMIN=${SQLADMIN:-nomadmin}
DB=${DB:-nomcolab}
PLAN=${PLAN:-plan-nomcolab}
APP=${APP:-nomcolab-wack}
JAR=../app/target/nom-colab.jar

crear() {
  : "${SQLPASS:?exporta SQLPASS}"
  az provider register -n Microsoft.Sql --wait
  az group create -n "$RG" -l "$LOC" -o none
  az sql server create -g "$RG" -n "$SQLSERVER" -l "$LOC" -u "$SQLADMIN" -p "$SQLPASS" -o none
  # Oferta gratuita: 100 000 vCore-segundos y 32 GB al mes; si se agotan, se pausa (no cobra).
  az sql db create -g "$RG" -s "$SQLSERVER" -n "$DB" -e GeneralPurpose -f Gen5 -c 1 \
    --compute-model Serverless --use-free-limit --free-limit-exhaustion-behavior AutoPause \
    --auto-pause-delay 60 --min-capacity 0.5 --backup-storage-redundancy Local -o none
  # 0.0.0.0 = permitir solo a los servicios de Azure (la Web App).
  az sql server firewall-rule create -g "$RG" -s "$SQLSERVER" -n PermitirServiciosAzure \
    --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
  az appservice plan create -g "$RG" -n "$PLAN" -l "$LOC" --is-linux --sku F1 -o none
  az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "JAVA:21-java21" -o none
  az webapp update -g "$RG" -n "$APP" --https-only true -o none
  # Al principio la página entra con el administrador (para crear las tablas la primera vez);
  # "./desplegar.sh roles" la cambia a nomcolab_app, que solo tiene privilegios sobre los datos.
  az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
    SPRING_DATASOURCE_URL="jdbc:sqlserver://$SQLSERVER.database.windows.net:1433;database=$DB;encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=60" \
    SPRING_DATASOURCE_USERNAME="$SQLADMIN" SPRING_DATASOURCE_PASSWORD="$SQLPASS" \
    NOM_DB_PLATAFORMA=sqlserver NOM_DB_ESPERA_MS=120000 NOM_DESCUBRIMIENTO=false \
    NOM_DATOS=/home/datos-nom NOM_PUERTO=80 WEBSITES_PORT=80 \
    WEBSITES_CONTAINER_START_TIME_LIMIT=600
}

subir() {
  (cd ../app && mvn -q package)
  az webapp deploy -g "$RG" -n "$APP" --src-path "$JAR" --type jar --async false -o none
  echo "Listo: https://$APP.azurewebsites.net"
}

# Una java que pueda correr un .java directamente (la de 2-PAGINA-Servidor es solo de ejecución).
java_con_compilador() {
  local j
  for j in "${JAVA:-}" "$(command -v java 2>/dev/null)" "$HOME"/.jdks/*/bin/java; do
    [ -n "$j" ] && [ -x "$j" ] && "$j" --list-modules 2>/dev/null | grep -q '^jdk.compiler' && { echo "$j"; return 0; }
  done
  return 1
}

roles() {
  : "${SQLPASS:?exporta SQLPASS (contraseña de $SQLADMIN)}" "${APP_PASS:?exporta APP_PASS}" "${LECTOR_PASS:?exporta LECTOR_PASS}"
  local java
  java=$(java_con_compilador) || { echo "Hace falta un JDK 17 o más nuevo (con javac)"; exit 1; }
  [ -f "$JAR" ] || (cd ../app && mvn -q package -DskipTests)
  ROLES_LIB=$(mktemp -d)
  unzip -q -j "$JAR" 'BOOT-INF/lib/mssql-jdbc-*' 'BOOT-INF/lib/spring-jdbc-*' 'BOOT-INF/lib/spring-core-*' \
    'BOOT-INF/lib/spring-beans-*' 'BOOT-INF/lib/spring-tx-*' 'BOOT-INF/lib/commons-logging-*' -d "$ROLES_LIB"
  # La base suele estar cerrada a internet (nomcolab azure down): se abre solo mientras dura esto.
  # (Variables globales: el trap corre al salir del script, cuando las de la función ya no existen.)
  ROLES_ABIERTA=$(az sql server show -g "$RG" -n "$SQLSERVER" --query publicNetworkAccess -o tsv)
  if [ "$ROLES_ABIERTA" != "Enabled" ]; then
    az sql server update -g "$RG" -n "$SQLSERVER" --enable-public-network true -o none
  fi
  trap 'if [ "$ROLES_ABIERTA" != "Enabled" ]; then az sql server update -g "$RG" -n "$SQLSERVER" --enable-public-network false -o none; fi; rm -rf "$ROLES_LIB"' EXIT
  export NOM_SQL_URL="jdbc:sqlserver://$SQLSERVER.database.windows.net:1433;database=$DB;encrypt=true;loginTimeout=120"
  export NOM_SQL_ADMIN="$SQLADMIN" NOM_SQL_ADMIN_PASS="$SQLPASS" NOM_SQL_APP_PASS="$APP_PASS" NOM_SQL_LECTOR_PASS="$LECTOR_PASS"
  "$java" -cp "$ROLES_LIB/*" AplicarSql.java aplicar ../app/src/main/resources/schema-sqlserver.sql
  "$java" -cp "$ROLES_LIB/*" AplicarSql.java aplicar roles-bd.sql
  "$java" -cp "$ROLES_LIB/*" AplicarSql.java verificar
  # La página deja de usar al administrador del servidor.
  az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
    SPRING_DATASOURCE_USERNAME=nomcolab_app SPRING_DATASOURCE_PASSWORD="$APP_PASS"
  az webapp config appsettings delete -g "$RG" -n "$APP" -o none --setting-names NOM_ADMIN_USUARIO NOM_ADMIN_CONTRASENA
  echo "Listo: la página se conecta como nomcolab_app (rol_nomcolab_app)."
}

case "${1:-}" in
  crear) crear ;;
  roles) roles ;;
  subir) subir ;;
  *) echo "Uso: $0 crear|roles|subir"; exit 1 ;;
esac
