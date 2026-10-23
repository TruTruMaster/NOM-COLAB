package mx.wack.nom.core.modelo;

public class Sesion {
    public String token;
    public String usuarioId;
    public long creada;
    public long expira;

    public boolean vigente(long ahora) {
        return expira > ahora;
    }
}
