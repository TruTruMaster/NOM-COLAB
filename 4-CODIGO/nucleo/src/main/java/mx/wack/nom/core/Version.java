package mx.wack.nom.core;

/**
 * Version de NOM-COLAB que corre en este servidor (la computadora, la Raspberry o un telefono que
 * hace de servidor). La informa /api/red/info.
 *
 * La pagina siempre trae la interfaz de su servidor, asi que nunca se desfasa. La app Android trae
 * la suya empaquetada: si se conecta a un servidor de otra version lo avisa (app.js), porque lo que
 * una importa de Office la otra puede verlo distinto. Al cambiar el formato de los documentos o la
 * interfaz hay que subir INTERFAZ aqui y en js/nucleo.js (NOM.INTERFAZ), y publicar servidor y app
 * juntos.
 */
public final class Version {
    /** La misma que versionName del APK. */
    public static final String APP = "0.12.2";
    /** Nivel de la interfaz y del formato de documentos. 12 = archivo de origen de Office dentro del documento. */
    public static final int INTERFAZ = 13;

    private Version() { }
}
