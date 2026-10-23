package mx.wack.nom.core.red;

/** Un espacio anunciado en la LAN, propio o de otro equipo (CU-15). */
public record EspacioRemoto(String id, String nombre, String propietario, String color,
                            String equipo, String host, int puerto, boolean local) { }
