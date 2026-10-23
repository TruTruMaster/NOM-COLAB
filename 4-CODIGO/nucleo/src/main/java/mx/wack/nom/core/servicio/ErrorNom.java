package mx.wack.nom.core.servicio;

/**
 * Error de negocio con mensaje listo para mostrarse al usuario. estado es el código HTTP con el
 * que responde la API (el servidor de la computadora y el del teléfono responden igual).
 */
public class ErrorNom extends RuntimeException {
    public static final int INVALIDO = 400, SIN_SESION = 401, PROHIBIDO = 403, NO_EXISTE = 404, CONFLICTO = 409, BLOQUEADO = 423;

    public final int estado;
    public final String campo;
    public final Object extra;

    public ErrorNom(int estado, String mensaje) { this(estado, mensaje, null, null); }

    public ErrorNom(int estado, String mensaje, String campo) { this(estado, mensaje, campo, null); }

    public ErrorNom(int estado, String mensaje, String campo, Object extra) {
        super(mensaje);
        this.estado = estado;
        this.campo = campo;
        this.extra = extra;
    }

    public static ErrorNom noEncontrado(String que) { return new ErrorNom(NO_EXISTE, que + " no existe"); }

    public static ErrorNom prohibido(String porque) { return new ErrorNom(PROHIBIDO, porque); }

    public static ErrorNom invalido(String mensaje, String campo) { return new ErrorNom(INVALIDO, mensaje, campo); }
}
