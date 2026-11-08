package mx.wack.nom.core.modelo;

/** Cuenta registrada. Nunca guarda la contrasena en claro: solo el hash con su sal (CU-05). */
public class Usuario {
    public String id;
    public String nombre;
    /** Nombre en minusculas, para que "Ana" y "ana" no puedan coexistir. */
    public String nombreClave;
    public String empresa;
    public String hashContrasena;
    public String sal;
    public int intentosFallidos;
    /** Epoch ms hasta el que la cuenta esta bloqueada; 0 si no lo esta. */
    public long bloqueadoHasta;
    public long creado;
    /** Color con el que aparece su cursor y su avatar. */
    public String color;
    public Preferencias preferencias = new Preferencias();
    /** Cuenta de invitado (entro con apodo y un codigo QR, sin registrarse): el espacio al que
        esta ligada. null en las cuentas normales. */
    public String invitadoDe;
    /** Codigo para recuperar la contrasena: solo su hash con su sal (se muestra una vez). */
    public String hashRecuperacion;
    public String salRecuperacion;

    public boolean estaBloqueado(long ahora) {
        return bloqueadoHasta > ahora;
    }

    public boolean esInvitado() { return invitadoDe != null && !invitadoDe.isEmpty(); }
}
