package mx.wack.nom.servidor.api;

import org.springframework.http.HttpStatus;

/** Error de negocio con mensaje listo para mostrarse al usuario. */
public class ErrorNom extends RuntimeException {
    public final HttpStatus estado;
    public final String campo;
    public final Object extra;

    public ErrorNom(HttpStatus estado, String mensaje) { this(estado, mensaje, null, null); }

    public ErrorNom(HttpStatus estado, String mensaje, String campo) { this(estado, mensaje, campo, null); }

    public ErrorNom(HttpStatus estado, String mensaje, String campo, Object extra) {
        super(mensaje);
        this.estado = estado;
        this.campo = campo;
        this.extra = extra;
    }

    public static ErrorNom noEncontrado(String que) { return new ErrorNom(HttpStatus.NOT_FOUND, que + " no existe"); }
    public static ErrorNom prohibido(String porque) { return new ErrorNom(HttpStatus.FORBIDDEN, porque); }
    public static ErrorNom invalido(String mensaje, String campo) { return new ErrorNom(HttpStatus.BAD_REQUEST, mensaje, campo); }
}
