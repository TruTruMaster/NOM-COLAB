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

    /** Fase 13 (sin Internet no hay cuentas): alias con un nombre al azar ("Colibri 37"), sin
        contrasena. Entra con la llave al azar que guardo su equipo; nadie escribe el nombre. */
    public boolean alias;
    /** SHA-256 (hex) de la llave del equipo del alias (la llave nunca se guarda en el servidor). */
    public String hashLlave;
    /** El alias del dueno del telefono que comparte: entra desde el mismo telefono y crea espacios. */
    public boolean dueno;
    /** Copia de una cuenta de la nube que entro con un pase firmado: de que nube viene (mismo id que alla). */
    public String nube;
    /** Cuenta con contrasena del telefono de antes de los alias: ya no entra; se queda su nombre como autor. */
    public boolean retirada;
    /** F.5 Version de los Terminos y del Aviso de privacidad que acepto, y cuando (epoch ms). */
    public String aceptoVersion;
    public long aceptoFecha;

    public boolean estaBloqueado(long ahora) {
        return bloqueadoHasta > ahora;
    }

    public boolean esInvitado() { return invitadoDe != null && !invitadoDe.isEmpty(); }

    /** Sin contrasena: invitado de un espacio, alias o copia de la nube (lo delicado no se le pide). */
    public boolean sinContrasena() { return esInvitado() || alias || nube != null || retirada; }
}
