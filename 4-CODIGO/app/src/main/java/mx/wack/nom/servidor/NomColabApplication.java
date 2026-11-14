package mx.wack.nom.servidor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Nodo local de NOM-COLAB. Sirve la interfaz web, la API y el canal en tiempo
 * real a los equipos de la misma red. Arranca con:
 *
 *     ./mvnw spring-boot:run        o        java -jar target/nom-colab.jar
 *
 * y se abre en http://localhost:8080 (o en la IP del equipo desde la LAN).
 */
@SpringBootApplication(scanBasePackages = "mx.wack.nom")
@EnableScheduling
public class NomColabApplication {
    public static void main(String[] args) {
        // D.1 Cifrado en reposo: la llave, la base H2 cifrada y que la llave abra estos datos.
        try {
            ArranqueCifrado.preparar();
        } catch (Exception e) {
            System.err.println("NOM-COLAB no arranca: " + e.getMessage());
            System.exit(1);
        }
        SpringApplication.run(NomColabApplication.class, args);
    }
}
