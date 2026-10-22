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
        SpringApplication.run(NomColabApplication.class, args);
    }
}
