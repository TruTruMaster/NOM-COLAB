#!/usr/bin/env bash
# NOM-COLAB · despliegue en Azure (App Service + Azure SQL Database), todo gratis
# con la suscripción Azure for Students del IPN. Ver ../docs/DESPLIEGUE-AZURE.md.
#
#   ./desplegar.sh crear      # una sola vez: grupo, base de datos, plan, web app y variables
#   ./desplegar.sh subir      # cada vez que cambie el código: compila y sube el jar
#
# Las contraseñas NO van aquí: se leen de las variables SQLPASS, NOM_ADMIN_CONTRASENA
# (por ejemplo: export SQLPASS='...' NOM_ADMIN_CONTRASENA='...').
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
  : "${SQLPASS:?exporta SQLPASS}" "${NOM_ADMIN_CONTRASENA:?exporta NOM_ADMIN_CONTRASENA}"
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
  az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
    SPRING_DATASOURCE_URL="jdbc:sqlserver://$SQLSERVER.database.windows.net:1433;database=$DB;encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=60" \
    SPRING_DATASOURCE_USERNAME="$SQLADMIN" SPRING_DATASOURCE_PASSWORD="$SQLPASS" \
    NOM_DB_PLATAFORMA=sqlserver NOM_DB_ESPERA_MS=120000 NOM_DESCUBRIMIENTO=false \
    NOM_DATOS=/home/datos-nom NOM_ADMIN_USUARIO="${NOM_ADMIN_USUARIO:-admin}" \
    NOM_ADMIN_CONTRASENA="$NOM_ADMIN_CONTRASENA" NOM_PUERTO=80 WEBSITES_PORT=80 \
    WEBSITES_CONTAINER_START_TIME_LIMIT=600
}

subir() {
  (cd ../app && mvn -q package)
  az webapp deploy -g "$RG" -n "$APP" --src-path "$JAR" --type jar --async false -o none
  echo "Listo: https://$APP.azurewebsites.net"
}

case "${1:-}" in
  crear) crear ;;
  subir) subir ;;
  *) echo "Uso: $0 crear|subir"; exit 1 ;;
esac
