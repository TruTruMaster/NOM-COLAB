package mx.wack.nom.android;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
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
        web = new WebView(this);
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
}
