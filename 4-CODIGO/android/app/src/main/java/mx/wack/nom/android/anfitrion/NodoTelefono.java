package mx.wack.nom.android.anfitrion;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import mx.wack.nom.core.servicio.Nodo;

/**
 * El teléfono como servidor: su nombre (el que se le puso en Ajustes), el puerto y las
 * direcciones por las que entran los demás. Incluye la del punto de acceso Wi-Fi del teléfono:
 * así funciona aunque no haya router, con el teléfono compartiendo su propia red.
 */
final class NodoTelefono implements Nodo {
    private final String id = UUID.randomUUID().toString().substring(0, 8);
    private final String equipo;
    private volatile int puerto;

    NodoTelefono(Context c) {
        String nombre = null;
        try { nombre = Settings.Global.getString(c.getContentResolver(), "device_name"); } catch (Exception ignorado) { }
        if (nombre == null || nombre.isBlank()) nombre = Build.MODEL;
        this.equipo = nombre;
    }

    void fijarPuerto(int p) { this.puerto = p; }

    @Override public String id() { return id; }

    @Override public String equipo() { return equipo; }

    @Override public int puerto() { return puerto; }

    @Override public List<String> direcciones() {
        List<String> r = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName().toLowerCase();
                // Datos móviles (rmnet, ccmni…) no sirven para la red local.
                if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("dummy") || n.startsWith("tun")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) r.add(a.getHostAddress());
                }
            }
        } catch (Exception ignorado) {
            // Sin interfaces legibles: se trata como "sin red".
        }
        return r;
    }

    @Override public List<InetAddress> difusion() {
        List<InetAddress> r = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                ni.getInterfaceAddresses().forEach(ia -> { if (ia.getBroadcast() != null) r.add(ia.getBroadcast()); });
            }
        } catch (Exception ignorado) { }
        return r;
    }
}
