package mx.wack.nom.core.modelo;

/** Preferencias globales del usuario (CU-27). Se aplican al momento, sin reiniciar. */
public class Preferencias {
    /** auto | claro | oscuro */
    public String tema = "auto";
    /** Minutos entre versiones automaticas. Rango 1..60. */
    public int autoguardadoMin = 5;
    /** Cuantas versiones conservar por documento. Rango 5..200. */
    public int versionesConservar = 30;
    /** alta | baja. Baja reduce sombras y animaciones para equipos con el hardware minimo. */
    public String calidad = "alta";
    public boolean movimientoReducido = false;
    /** Atenua todo lo que no sea el bloque activo en el modo enfoque. */
    public boolean enfoqueAtenuar = true;
    public String idioma = "es";

    public void validar() {
        if (autoguardadoMin < 1 || autoguardadoMin > 60)
            throw new IllegalArgumentException("El autoguardado debe estar entre 1 y 60 minutos");
        if (versionesConservar < 5 || versionesConservar > 200)
            throw new IllegalArgumentException("Se conservan entre 5 y 200 versiones");
        if (!tema.matches("auto|claro|oscuro")) throw new IllegalArgumentException("Tema no valido");
        if (!calidad.matches("alta|baja")) throw new IllegalArgumentException("Calidad no valida");
    }
}
