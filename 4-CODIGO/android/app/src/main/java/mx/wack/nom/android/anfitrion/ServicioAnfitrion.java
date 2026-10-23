package mx.wack.nom.android.anfitrion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import mx.wack.nom.android.MainActivity;
import mx.wack.nom.android.R;
import mx.wack.nom.core.red.Descubrimiento;
import mx.wack.nom.core.servicio.Bitacora;
import mx.wack.nom.core.servicio.Cifrado;
import mx.wack.nom.core.servicio.Difusor;
import mx.wack.nom.core.servicio.ServicioCuentas;
import mx.wack.nom.core.servicio.ServicioDocumentos;
import mx.wack.nom.core.servicio.ServicioEspacios;

/**
 * El teléfono como servidor de NOM-COLAB. Corre en primer plano (con su notificación) para que
 * Android no lo cierre, y mantiene el Wi-Fi y el procesador despiertos mientras sirve. Arma los
 * mismos servicios que el servidor de la computadora sobre archivos de la app, abre el puerto
 * HTTP (8080 o el siguiente libre) y se anuncia en la red como cualquier otro servidor.
 */
public class ServicioAnfitrion extends Service {
    private static final Bitacora log = Bitacora.de(ServicioAnfitrion.class);
    public static final String DETENER = "mx.wack.nom.DETENER_SERVIDOR";
    private static final String CANAL = "servidor";
    private static final int NOTIFICACION = 7;

    private static volatile ServicioAnfitrion activo;
    private static volatile String ultimoError;

    private NodoTelefono nodo;
    private ServidorHttp http;
    private Descubrimiento descubrimiento;
    private ServicioDocumentos documentos;
    private ScheduledExecutorService reloj;
    private PowerManager.WakeLock despierto;
    private WifiManager.WifiLock wifi;
    private WifiManager.MulticastLock difusion;
    private int puerto;

    // ------------------------------------------------------------------ estado (para la interfaz)

    /** {activo, puerto, local, direcciones, equipo, error}: lo que la interfaz muestra. */
    public static String estadoJson() {
        try {
            JSONObject o = new JSONObject();
            ServicioAnfitrion s = activo;
            o.put("activo", s != null && s.puerto > 0);
            if (s != null && s.puerto > 0) {
                o.put("puerto", s.puerto);
                o.put("local", "http://127.0.0.1:" + s.puerto);
                List<String> dirs = s.nodo.direcciones();
                JSONArray d = new JSONArray();
                for (String ip : dirs) d.put("http://" + ip + ":" + s.puerto);
                o.put("direcciones", d);
                o.put("equipo", s.nodo.equipo());
            }
            if (ultimoError != null) o.put("error", ultimoError);
            return o.toString();
        } catch (Exception e) {
            return "{\"activo\":false}";
        }
    }

    /** Si la persona dejó el servidor encendido, se vuelve a encender al abrir la app. */
    public static boolean debeSeguir(Context c) {
        return prefs(c).getBoolean("encendido", false);
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("servidor", MODE_PRIVATE); }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && DETENER.equals(intent.getAction())) {
            prefs(this).edit().putBoolean("encendido", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        primerPlano("Encendiendo el servidor…");
        if (http == null) {
            try {
                iniciar();
                ultimoError = null;
                prefs(this).edit().putBoolean("encendido", true).apply();
                primerPlano(null);
            } catch (Exception e) {
                ultimoError = "No se pudo encender el servidor: " + e.getMessage();
                log.error("No se pudo encender el servidor", e);
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        return START_STICKY;
    }

    private void iniciar() throws Exception {
        nodo = new NodoTelefono(this);
        Almacen almacen = new Almacen(new File(getFilesDir(), "servidor"));
        Repositorios.Usuarios usuarios = new Repositorios.Usuarios(almacen);
        Repositorios.Espacios espaciosRepo = new Repositorios.Espacios(almacen);
        Repositorios.Documentos docsRepo = new Repositorios.Documentos(almacen);
        Cifrado cifrado = new Cifrado();
        // Mismos valores que application.properties del servidor de la computadora.
        Difusor difusor = new Difusor(5);
        ServicioCuentas cuentas = new ServicioCuentas(usuarios, cifrado, 5, 15, 72, "", "");
        ServicioEspacios espacios = new ServicioEspacios(espaciosRepo, docsRepo, cuentas, difusor, nodo, cifrado);
        documentos = new ServicioDocumentos(docsRepo, espacios, cuentas, difusor, cifrado, nodo);
        descubrimiento = new Descubrimiento(nodo, espaciosRepo, usuarios, Json.YO, true, 47474);
        cuentas.asegurarAdministrador();

        http = new ServidorHttp(getAssets(), new ApiTelefono(cuentas, espacios, documentos, difusor, descubrimiento, nodo));
        puerto = http.iniciar(8080);
        nodo.fijarPuerto(puerto);

        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            difusion = wm.createMulticastLock("nom-servidor");
            difusion.setReferenceCounted(false);
            difusion.acquire();
            wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "nom-servidor");
            wifi.setReferenceCounted(false);
            wifi.acquire();
        }
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            despierto = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nom:servidor");
            despierto.setReferenceCounted(false);
            despierto.acquire();
        }
        descubrimiento.iniciar();

        // Lo mismo que Tareas en la computadora.
        reloj = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "nom-tareas");
            t.setDaemon(true);
            return t;
        });
        reloj.scheduleWithFixedDelay(seguro(documentos::persistir), 800, 800, TimeUnit.MILLISECONDS);
        reloj.scheduleWithFixedDelay(seguro(documentos::escribirBitacora), 10, 10, TimeUnit.SECONDS);
        reloj.scheduleAtFixedRate(seguro(documentos::autoguardar), 60, 60, TimeUnit.SECONDS);
        reloj.scheduleAtFixedRate(seguro(difusor::latido), 20, 20, TimeUnit.SECONDS);
        reloj.scheduleAtFixedRate(seguro(() -> primerPlano(null)), 30, 30, TimeUnit.SECONDS);
        activo = this;
        log.info("Servidor del teléfono en el puerto {} ({})", puerto, nodo.direcciones());
    }

    private static Runnable seguro(Runnable r) {
        return () -> {
            try { r.run(); } catch (Throwable e) { log.error("Tarea del servidor", e); }
        };
    }

    @Override
    public void onDestroy() {
        activo = null;
        if (reloj != null) reloj.shutdownNow();
        try { if (documentos != null) documentos.alApagar(); } catch (Throwable e) { log.error("Al apagar", e); }
        if (descubrimiento != null) descubrimiento.detener();
        if (http != null) http.detener();
        if (despierto != null && despierto.isHeld()) despierto.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        if (difusion != null && difusion.isHeld()) difusion.release();
        http = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ------------------------------------------------------------------ notificación

    /** La notificación fija: qué dirección usan los demás y un botón para detener. */
    private void primerPlano(String texto) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Servidor en este teléfono", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Avisa mientras el teléfono comparte los espacios de NOM-COLAB en la red.");
            nm.createNotificationChannel(c);
        }
        if (texto == null) {
            List<String> dirs = nodo == null ? List.of() : nodo.direcciones();
            texto = dirs.isEmpty() ? "Sin red local: conecta el Wi-Fi o activa el punto de acceso del teléfono."
                    : "Los demás entran en http://" + dirs.get(0) + ":" + puerto;
        }
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent abrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), fl);
        PendingIntent detener = PendingIntent.getService(this, 1, new Intent(this, ServicioAnfitrion.class).setAction(DETENER), fl);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        Notification n = b.setSmallIcon(R.drawable.ic_notificacion)
                .setContentTitle("Este teléfono es el servidor de NOM-COLAB")
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(texto))
                .setOngoing(true)
                .setContentIntent(abrir)
                .addAction(new Notification.Action.Builder(null, "Detener", detener).build())
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICACION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICACION, n);
    }
}
