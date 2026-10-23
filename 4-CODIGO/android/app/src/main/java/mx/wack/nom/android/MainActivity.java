package mx.wack.nom.android;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import mx.wack.nom.android.anfitrion.ServicioAnfitrion;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cliente Android de NOM-COLAB (ClienteAndroid del diagrama de clases).
 *
 * La interfaz es la misma que sirve el servidor, empaquetada en assets/: así el
 * editor abre aunque no haya red (CU-26) y las operaciones se encolan en el
 * dispositivo hasta volver a ver el servidor de la LAN. Lo único nativo es lo que
 * un navegador no puede hacer: escuchar el anuncio UDP de la red local, guardar
 * archivos en Descargas y abrir el selector de archivos.
 */
public class MainActivity extends Activity {

    private static final int ELEGIR_ARCHIVO = 41;
    private static final int PUERTO_DESCUBRIMIENTO = 47474;

    private WebView web;
    private ValueCallback<Uri[]> alElegir;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        web = new Hoja(this);
        web.setBackgroundColor(Color.parseColor("#F5F3EF"));
        // El WebView no respeta su propio padding: el margen de las barras va en un contenedor.
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#EFECE6"));
        raiz.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
        respetarBarrasDelSistema(raiz);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // cola sin conexión y copia local de documentos
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);   // la interfaz (file://) habla con el servidor de la LAN
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);                      // el tamaño de letra del sistema no deforma la interfaz
        // La interfaz tiene sus propios temas claro y oscuro: el sistema (modo oscuro forzado de
        // Android o de la marca del teléfono) no la debe repintar.
        if (Build.VERSION.SDK_INT >= 33) s.setAlgorithmicDarkeningAllowed(false);
        else if (Build.VERSION.SDK_INT >= 29) s.setForceDark(WebSettings.FORCE_DARK_OFF);
        if (Build.VERSION.SDK_INT >= 29) web.setForceDarkAllowed(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));   // enlaces externos al navegador
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (alElegir != null) alElegir.onReceiveValue(null);
                alElegir = cb;
                try {
                    startActivityForResult(p.createIntent(), ELEGIR_ARCHIVO);
                } catch (Exception e) {
                    alElegir = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Puente(), "NomAndroid");

        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /** Desde Android 15 la app dibuja bajo las barras; se deja el margen que ocupan. */
    private void respetarBarrasDelSistema(View raiz) {
        raiz.setOnApplyWindowInsetsListener((v, insets) -> {
            int arriba, abajo, izq, der;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                arriba = i.top; abajo = i.bottom; izq = i.left; der = i.right;
            } else {
                arriba = insets.getSystemWindowInsetTop(); abajo = insets.getSystemWindowInsetBottom();
                izq = insets.getSystemWindowInsetLeft(); der = insets.getSystemWindowInsetRight();
            }
            v.setPadding(izq, arriba, der, abajo);
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        // Primero se cierra la ventana o el menú que esté abierto; si no hay, se regresa de pantalla.
        web.evaluateJavascript("(window.NOM && NOM.hayHoja && NOM.hayHoja()) ? (NOM.cerrarHoja(), 'cerrada') : 'no'", r -> {
            if (r != null && r.contains("cerrada")) return;
            if (web.canGoBack()) web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido != ELEGIR_ARCHIVO || alElegir == null) return;
        alElegir.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, datos));
        alElegir = null;
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    /** Lo que la interfaz web puede pedirle al teléfono (window.NomAndroid). */
    private class Puente {

        /**
         * CU-15 en Android: escucha 3.5 s los anuncios UDP de los equipos que tienen
         * la "Conexión del proyecto" activa y responde a window.__nomServidores(json).
         */
        @JavascriptInterface
        public void buscarServidores() {
            new Thread(() -> {
                Map<String, JSONObject> vistos = new LinkedHashMap<>();
                WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                WifiManager.MulticastLock candado = wifi == null ? null : wifi.createMulticastLock("nom-descubrimiento");
                DatagramSocket sock = null;
                try {
                    if (candado != null) { candado.setReferenceCounted(false); candado.acquire(); }
                    sock = new DatagramSocket(null);
                    sock.setReuseAddress(true);
                    sock.setBroadcast(true);
                    sock.bind(new InetSocketAddress(PUERTO_DESCUBRIMIENTO));
                    sock.setSoTimeout(500);
                    byte[] buf = new byte[16 * 1024];
                    long fin = System.currentTimeMillis() + 3500;
                    while (System.currentTimeMillis() < fin) {
                        try {
                            DatagramPacket p = new DatagramPacket(buf, buf.length);
                            sock.receive(p);
                            JSONObject a = new JSONObject(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                            if (a.optInt("nom") != 1) continue;
                            JSONObject s = new JSONObject();
                            s.put("equipo", a.optString("equipo"));
                            s.put("host", p.getAddress().getHostAddress());
                            s.put("puerto", a.optInt("puerto", 8080));
                            s.put("espacios", a.optJSONArray("espacios") == null ? 0 : a.optJSONArray("espacios").length());
                            vistos.put(a.optString("servidor"), s);
                        } catch (SocketTimeoutException ignorado) {
                            // se sigue escuchando hasta el plazo
                        }
                    }
                } catch (Exception e) {
                    // sin Wi-Fi o puerto ocupado: se devuelve lo que se haya visto
                } finally {
                    if (sock != null) sock.close();
                    if (candado != null && candado.isHeld()) candado.release();
                }
                String json = new JSONArray(vistos.values()).toString();
                runOnUiThread(() -> web.evaluateJavascript(
                        "window.__nomServidores && window.__nomServidores(" + JSONObject.quote(json) + ")", null));
            }, "nom-buscar").start();
        }

        // ------------------------------------------------------------ el teléfono como servidor

        /** Enciende el servidor del teléfono y espera a que abra su puerto (hasta 6 s). */
        @JavascriptInterface
        public String iniciarServidor() {
            if (Build.VERSION.SDK_INT < 26)
                return "{\"activo\":false,\"error\":\"Para que el teléfono sea el servidor se necesita Android 8.0 o más reciente.\"}";
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, 3));
            startForegroundService(new Intent(MainActivity.this, ServicioAnfitrion.class));
            long fin = System.currentTimeMillis() + 6000;
            String estado = ServicioAnfitrion.estadoJson();
            while (System.currentTimeMillis() < fin && !estado.contains("\"activo\":true") && !estado.contains("\"error\"")) {
                try { Thread.sleep(60); } catch (InterruptedException e) { break; }
                estado = ServicioAnfitrion.estadoJson();
            }
            return estado;
        }

        @JavascriptInterface
        public String detenerServidor() {
            startService(new Intent(MainActivity.this, ServicioAnfitrion.class).setAction(ServicioAnfitrion.DETENER));
            return "{\"activo\":false}";
        }

        @JavascriptInterface
        public String estadoServidor() { return ServicioAnfitrion.estadoJson(); }

        /** Hoja de compartir de Android (WhatsApp, correo, Bluetooth…) con un texto, p. ej. la dirección del servidor. */
        @JavascriptInterface
        public void compartirTexto(String texto) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, texto);
                startActivity(Intent.createChooser(i, "Compartir"));
            });
        }

        /** CU-29 en Android: los Blob de descarga no funcionan en WebView; se guarda en Descargas. */
        @JavascriptInterface
        public void guardarArchivo(String nombre, String mime, String base64) {
            try {
                byte[] datos = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream o = getContentResolver().openOutputStream(uri)) { o.write(datos); }
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    try (FileOutputStream o = new FileOutputStream(new File(dir, nombre))) { o.write(datos); }
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Guardado en Descargas: " + nombre, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show());
            }
        }
    }

    /**
     * WebView sin la barra nativa de "Cortar · Copiar · Seleccionar todo" al seleccionar texto: esas
     * acciones (y más) están en la ruedita, que sale al mantener presionado. Las manijas para ajustar
     * la selección se conservan.
     */
    static class Hoja extends WebView {
        Hoja(Context c) { super(c); }

        @Override
        public ActionMode startActionMode(ActionMode.Callback cb) { return super.startActionMode(new SinMenu(cb)); }

        @Override
        public ActionMode startActionMode(ActionMode.Callback cb, int tipo) { return super.startActionMode(new SinMenu(cb), tipo); }
    }

    /** Envuelve el callback del sistema y deja su menú vacío (así la barra flotante no aparece). */
    static class SinMenu extends ActionMode.Callback2 {
        private final ActionMode.Callback original;
        SinMenu(ActionMode.Callback original) { this.original = original; }

        @Override
        public boolean onCreateActionMode(ActionMode modo, Menu menu) {
            original.onCreateActionMode(modo, menu);
            menu.clear();
            return true;
        }

        @Override
        public boolean onPrepareActionMode(ActionMode modo, Menu menu) {
            original.onPrepareActionMode(modo, menu);
            menu.clear();
            return true;
        }

        @Override
        public boolean onActionItemClicked(ActionMode modo, MenuItem item) { return original.onActionItemClicked(modo, item); }

        @Override
        public void onDestroyActionMode(ActionMode modo) { original.onDestroyActionMode(modo); }

        @Override
        public void onGetContentRect(ActionMode modo, View vista, Rect rect) {
            if (original instanceof ActionMode.Callback2) ((ActionMode.Callback2) original).onGetContentRect(modo, vista, rect);
            else super.onGetContentRect(modo, vista, rect);
        }
    }
}
