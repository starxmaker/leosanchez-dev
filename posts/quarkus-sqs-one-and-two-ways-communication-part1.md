---
title: "[Parte 1] Comunicación unidireccional y bidireccional entre microservicios Quarkus a través de colas SQS: Ambiente local y adaptador del SDK"
imageUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/quarkus-sqs-one-and-two-ways-communication/part1-cover.jpg"
thumbnailUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/quarkus-sqs-one-and-two-ways-communication/part1-thumbnail.jpg"
imageAuthorName: Alexander Popov
imageAuthorUrl: https://unsplash.com/@5tep5?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/traffic?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022-02-01 09:49:00'
readingTime: 15
excerpt: "La comunicación por colas por esencia no espera respuesta, pero, por su mayor seguridad y rendimiento, muchos las utilizan con el modelo consulta-respuesta. ¿Cómo implementarlo en Quarkus?"
author: "Leonel Sánchez"
tags:
    - "Quarkus"
    - "Java"
    - "AWS"
    - "SQS"
    - "Comunicación bidireccional"
    - "Comunicación unidireccional"
---

*Esta es la primera parte de tres artículos que explican la implementación de una comunicación uni y bidireccional a través de colas SQS en Quarkus.*

La comunicación de microservicios a través de colas es comunmente realizada de forma unidireccional; es decir, no se espera una respuesta. No obstante, debido a la gran seguridad que ofrecen y por el mayor control de recursos que provee para nuestros servicios, muchos también las han empleado para la comunicación bidireccional, el tradicional modelo de consulta-respuesta.

Para realizarlo, AWS ofrece una [librería desarrollada por la comunidad](https://aws.amazon.com/es/blogs/compute/simple-two-way-messaging-using-the-amazon-sqs-temporary-queue-client/). No obstante, esta presenta ciertas desventajas: 

- Solo está disponible en Java.
- No es compatible con la compilación a imagen nativa de GraalVM.
- Solo permite el SDK v1 de AWS, entre otras.

Por ello, a lo largo de estos tres artículos se sugiere una forma (muy *opinionated* cabe destacar) de implementar una arquitectura que soporte un modelo unidireccional y bidireccional entre un productor y un consumidor en Quarkus. Aunque no utilizaremos la librería provista por AWS, si tomaremos inspiración en ella, en particular en el concepto de colas virtuales, que reduce significativamente las llamadas a SQS (lo que conlleva un menor costo). Aunque se utilizará Quarkus y se sacará el máximo provecho de sus bondades, es totalmente posible implementar el modelo en otros frameworks o incluso lenguajes de programación.

# ¿Qué vamos a hacer?

Construiremos un servicio básico que consultará y retornará las coordenadas de una ciudad dada. Para lograrlo, simulará llamadas a una API externa que sólo permite 50 llamadas por segundo (tal como Google Maps API) y retornará las coordenadas de una ciudad. Tomaremos ventaja del procesamiento por cola de Amazon SQS, que canaliza las peticiones *out-of-the-box*, y la procesaremos en un único hilo (pueden ser más, pero siempre teniendo control del número), asegurando así que el servicio no atienda más llamadas de las que puede tolerar. Asimismo, nuestro servicio también permitirá publicar nuestras propias coordenadas, a través de una comunicación unidireccional.

Para lograr aquello, implementaremos dos microservicios: un productor, que expondrá los endpoints y enviará las peticiones en forma de mensajes a una cola, y un consumidor, que leerá los mensajes y se comunicará con nuestra pseudo API externa.

Con respecto al cliente, cada instancia de nuestro microservicio tendrá su propia cola de respuestas. Esta es creada al momento de iniciar la aplicación y se elimina al terminarla. Cuando se solicite recibir un mensaje, se iniciará una ejecución de una tarea de *polling*, siempre y cuando no haya otra corriendo. Esta ejecución traerá todos los mensajes de nuestra cola, sin importar qué petición les dió origen y los colocará en una lista. Cuando enviemos un mensaje con la intención de recibir respuesta, adjuntaremos un atributo extra con un identificador único, también llamado firma, con el proposito de poder buscar en esta lista la respuesta a nuestro mensaje.

El lado del consumidor es un poco más simple: hacemos *long polling* constantemente en espera de un mensaje. Al recibir uno, lo proceso y si el procesamiento retorna un resultado válido lo retorno a la fila de respuesta del cliente adjuntandole la misma firma que recibí de él (en caso de ausencia, como es el caso de las peticiones unidireccionales, no retorna nada).

En ambas partes puede parecer un poco engorroso levantar la arquitectura, pero se configurará de tal forma de que si se necesita hacer más peticiones o configurar más listeners, sea de la forma más declarativa posible.

Podrán encontrar el código fuente de nuestro proyecto en el siguiente enlace: https://github.com/starxmaker/sqs-quarkus-two-way-and-one-way-messaging

A continuación podemos ver un diagrama de lo que haremos:

![Quarkus SQS Diagram implementation](https://leonel-sanchez-developer-blog.s3.amazonaws.com/quarkus-sqs-one-and-two-ways-communication/QuarkusSQSImplementationDiagram.png "Quarkus SQS Diagram implementation")


# Requerimientos

- Cumplir los requerimientos para correr proyectos Quarkus
- Docker (o una cuenta AWS con los permisos necesarios)
- AWS CLI 

# Levantamiento de un ambiente local

Para probar la arquitectura que vamos a implementar, recomiendo abiertamente utilizar Localstack y así evitar incurrir en gastos. Para levantar Localstack de forma local, ejecuten el siguiente comando:

```bash
docker run --rm --name local-sqs -p 8010:4576 -e SERVICES=sqs -e START_WEB=0 -d localstack/localstack:0.11.1
```

Esto levantará un contenedor corriendo Localstack en el puerto 8010, Luego, crearemos un perfil en la CLI de AWS para poder autenticarnos con este servicio.

```bash
aws configure --profile localstack
```

Podemos ingresar lo que queramos en las preguntas que nos haga la consola. Solo debemos asegurarnos de especificar una región válida.

Finalmente, crearemos dos colas, una para la comunicación bidireccional:

```bash
aws sqs create-queue --queue-name=TwoWaysQueue --profile localstack --endpoint-url=http://localhost:8010
```

Y otra para la comunicación unidireccional:

```bash
aws sqs create-queue --queue-name=OneWayQueue --profile localstack --endpoint-url=http://localhost:8010
```

La consola nos entregará la url de ambas colas. Guardarlas, pues las utilizaremos más adelante.

# Implementación de adaptador del SDK de AWS

Para comunicarnos con nuestro proveedor de colas, utilizaremos el patrón adaptador y así mantener nuestro código limpio e independiente de dependencias. 

Como este código nos será útil en ambos servicios crearemos un paquete aparte que será utilizado como dependencia.

Primero ejecutemos el siguiente comando para inicializar el paquete:

```bash
quarkus create app dev.leosanchez:sqs-quarkus-common -x=amazon-sqs
```

Una vez inicializado, vamos a nuestro pom.xml y especificamos una versión a nuestro paquete:

```xml
<groupId>dev.leosanchez</groupId>
<artifactId>sqs-quarkus-common</artifactId>
<version>1.0.0</version>
```

Luego agregamos una nueva dependencia que es requerimiento para el cliente SQS:

```xml
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>url-connection-client</artifactId>
</dependency>
```
Por último, como este proyecto será importado por otro, es necesario generar un indice para facilitar el reconocimiento de clases:

```xml
<build>
    <plugins>
        <!-- ... -->
        <plugin>
            <groupId>org.jboss.jandex</groupId>
            <artifactId>jandex-maven-plugin</artifactId>
            <version>1.2.2</version>
            <executions>
                <execution>
                <id>make-index</id>
                <goals>
                    <goal>jandex</goal>
                </goals>
                </execution>
            </executions>
        </plugin>
        <!-- ... -->
    </plugins>
</build>
```

Una vez finalizado esto, podemos partir con nuestro código. Primero definiremos una estructura de datos que contendrá un mensaje recibido y su metadata:

```java
@RegisterForReflection
public class QueueMessage {
    private String message;
    private Map<String, String> attributes;
    private String receiptHandle;
    public QueueMessage(String message, String receiptHandle, Map<String, String> attributes) {
        this.message = message;
        this.attributes = attributes;
        this.receiptHandle = receiptHandle;
    }
    public String getMessage() {
        return message;
    }
    public Map<String, String> getAttributes() {
        return attributes;
    }
    public String getReceiptHandle() {
        return receiptHandle;
    }
}

```

Como ven, es una estructura simple que además del mensaje, contiene una lista de atributos adjuntos (Lo que nos será muy util a futuro para identificar el servicio emisor del mensaje y la función que lo invocó). Por último, también contiene un recibo de la recepción del mensaje, el cual es útil para la eliminación de mensajes de la cola original (y así no recibir una y otra vez el mismo mensaje).

También definiremos excepciones personalizadas, solo con el fin de mantener la abstracción con la dependencia de AWS:

- MessagePollingException
- MessageRemovalException
- MessageSendingException
- QueueCreationException

Si se desea se puede crear una estructura de excepción más compleja, pero para mantener las cosas sencillas, seguiremos la siguiente estructura para cada excepción:

```java
@RegisterForReflection
public class QueueCreationException extends Exception {
    public QueueCreationException(String message) {
        super(message);
    }
}
```

Ahora describiremos una interfaz que nuestros adaptadores de cola deben implementar. La funcionalidad que esperamos es poder enviar, recibir y eliminar mensajes, como también crear y eliminar colas (esto último para poder crear colas temporales). 

```java
public interface IQueueAdapter {
    public void sendMessage(String targetQueueUrl, String message) throws MessageSendingException;
    public void sendMessageWithAttributes(String targetQueueUrl, String message, Map<String, String> attributes) throws MessageSendingException;
    public List<QueueMessage> receiveMessages(String queueUrl, Integer maxNumberOfMessages) throws MessagePollingException;
    public void deleteMessage(String queueUrl, String receiptHandle) throws MessageRemovalException;
    public String createQueue(String queueName) throws QueueCreationException;
    public void deleteQueue(String queueUrl) throws QueueRemovalException;
    public Optional<String> getQueueUrl(String queueName) throws QueueRetrievalException;
}
```

Pasemos ahora a implementar nuestra interfaz. Definamos la clase con un *logger* e inyectemos el cliente SQS que instalamos como dependencia.

```java
@ApplicationScoped
@LookupIfProperty(name = "queue.provider", stringValue = "sqs")
public class SQSAdapter implements IQueueAdapter {

    // just a logger
    private static final Logger LOG = Logger.getLogger(SQSAdapter.class);

    // the sdk client
    @Inject
    SqsClient sqs;

    //..

}
```

Fíjense en la anotación `LookupIfProperty`. Lo que hace esto es buscar en nuestro archivo `application.properties` la propiedad `queue.provider` y verifica que su valor sea `sqs`. Si esto se cumple, cada vez que inyectemos un bean de la interfaz, será uno que corresponda a esta implementación. Esto es muy útil para cambiar rápidamente de dependencias sin tener que modificar código.

Sigamos entonces implementando nuestro adaptador. Partamos con los métodos de envío de mensajes:

```java
 @Override
public void sendMessage(String targetQueueUrl, String message) throws MessageSendingException {
    sendMessageWithAttributes(targetQueueUrl, message, new HashMap<>());
}

@Override
public void sendMessageWithAttributes(String targetQueueUrl, String message, Map<String, String> attributes) throws MessageSendingException {
    LOG.info("SQS - Sending message " + message);
    try {
        // we assign the attributes to the message
        Map<String, MessageAttributeValue> messageAttributes = new HashMap<>() {
            {
                attributes.forEach((key, value) -> {
                    put(key, MessageAttributeValue.builder().dataType("String").stringValue(value).build());
                });
            }
        };
        // we build the request
        SendMessageRequest requestWithResponseUrl = SendMessageRequest.builder()
                .queueUrl(targetQueueUrl)
                .messageBody(message)
                .messageAttributes(messageAttributes)
                .build();
        // we send the request
        sqs.sendMessage(requestWithResponseUrl);
    } catch(Exception e) {
        LOG.error("SQS - Error sending message " + message, e);
        throw new MessageSendingException(e.getMessage());
    }
}
```

Nuestra implementación hace lo siguiente:

- Recibo la url de la cola de destino, el mensaje y un mapa de atributos opcional que deseo adjuntar.
- Transformo los atributos a la estructura que SQS espera.
- Construyo una petición, especificando la cola de destino, el mensaje y los atributos.
- Envío la petición

Perfecto. Pasemos ahora al siguiente método: recibir mensajes

```java
@Override
public List<QueueMessage> receiveMessages(String queueUrl, Integer maxNumberPerMessages) throws MessagePollingException {
    try {
        List<QueueMessage> response = new ArrayList<>();
        LOG.info("SQS - Polling messages");
        // we prepare the request
        List<Message> messages = sqs.receiveMessage(ReceiveMessageRequest.builder()
                .queueUrl(queueUrl)
                .maxNumberOfMessages(maxNumberPerMessages)
                .waitTimeSeconds(20) // long polling
                .messageAttributeNames("All")
                .attributeNames(List.of(QueueAttributeName.ALL))
                .build()).messages();
        if (messages.size() > 0) {
            LOG.info("SQS - Messages received");
            for (Message message : messages) {
                // if we receive messages, we transform them to our data structure
                Map<String, String> attributes = new HashMap<>() {{
                    message.messageAttributes().forEach((key, value) -> {
                        put(key, value.stringValue());
                    });
                }};
                QueueMessage queueMessage = new QueueMessage(message.body(), message.receiptHandle(), attributes);
                // we add them to the list that we will return
                response.add(queueMessage);
            }
        } else {
            LOG.info("SQS - No messages");
        }
        return response;
    } catch (Exception e) {
        throw new MessagePollingException(e.getMessage());
    }
}
```

Puede parecer mucho código, pero en realidad el proceso es bastante sencillo:

- Recibimos la url de la cola y la cantidad máxima de mensajes que esperamos recibir.
- Construimos una petición con estos datos. Colocamos el tiempo de espera de 20 segundos y así habilitamos long polling (lo que significará menores costos).
- Si recibimos mensajes, los transformamos a nuestra propia estructura.
- Retornamos la lista de mensajes bajo nuestra estructura

Pasemos al siguiente, la eliminación de mensajes:

```java
@Override
public void deleteMessage(String queueUrl, String receiptHandle) throws MessageRemovalException {
    try {
        LOG.info("SQS - Deleting message with receipt handle: " + receiptHandle);
        sqs.deleteMessage(DeleteMessageRequest.builder().queueUrl(queueUrl).receiptHandle(receiptHandle).build());
    } catch (Exception e) {
        LOG.error("SQS - Error deleting message with receipt handle: " + receiptHandle, e);
        throw new  MessageRemovalException(e.getMessage());
    }
}
```

Este fue el más simple. Solo creamos una petición con la cola que contiene el mensaje a eliminar y el recibo de recepción del mensaje. Con esto eliminamos el mensaje de la cola original.

Pasemos ahora a los métodos relativos a la cola. Empecemos con la creación:

```java
@Override
public String createQueue(String queueName) throws QueueCreationException {
    try {
        LOG.info("SQS - Creating queue: " + queueName);
        CreateQueueRequest createQueueRequest = CreateQueueRequest.builder()
                .queueName(queueName)
                .build();
        // we return the created queue url
        return sqs.createQueue(createQueueRequest).queueUrl();
    } catch (Exception e) {
        LOG.error("SQS - Error creating queue: " + queueName, e);
        throw new QueueCreationException(e.getMessage());
    }
}
```

Este es igualmente sencillo:

- Recibimos el nombre de la cola que queremos crear.
- Construimos una petición con este nombre.
- Creamos la cola y retornamos la url.

Asimismo, también implementaremos una forma de obtener una url de una cola si sabemos su nombre:

```java
@Override
public Optional<String> getQueueUrl(String queueName) throws QueueRetrievalException {
    try {
        LOG.info("SQS - Checking queue existence: " + queueName);
        GetQueueUrlRequest request = GetQueueUrlRequest.builder().queueName(queueName).build();
        GetQueueUrlResponse response = sqs.getQueueUrl(request);
        return Optional.of(response.queueUrl());
    } catch (QueueDoesNotExistException e) {
        return Optional.empty();
    } catch (Exception e) {
        throw new QueueRetrievalException(e.getMessage());
    }
}
```

Como vemos, nos comunicamos con el SDK para poder hacer la busqueda de este valor.

Por último, implementemos la eliminación de colas:

```java
@Override
public void deleteQueue(String queueUrl) throws QueueRemovalException {
    try {
        LOG.info("SQS - Deleting queue: " + queueUrl);
        DeleteQueueRequest request = DeleteQueueRequest.builder().queueUrl(queueUrl).build();
        sqs.deleteQueue(request);
    } catch (Exception e) {
        LOG.error("SQS - Error while deleting queue", e);
        throw new QueueRemovalException(e.getMessage());
    }
}
```

En este último método recibimos la url de la cola que deseamos eliminar y construimos una petición con este dato.

<details>
<summary> Pruebas de integración (opcional) </summary>

Realizaremos pruebas de integración para probar que nuestro adaptador se comunique correctamente con los servicios de AWS. Utilizaremos nuevamente *localstack* a través de la utilidad de TestContainers y asi probaremos nuestro código en un ambiente controlado.

Antes de implementar nuestra prueba de integración del adaptador, primero debemos construir la clase de pruebas:

```java
@QuarkusTest
@TestProfile(SQSAdapterTest.TestProfile.class)
public class SQSAdapterTest {
    @Inject
    SQSAdapter adapter;

    @Container
    public static GenericContainer<?> localstack = new GenericContainer<>(
        DockerImageName.parse("localstack/localstack:0.11.1"))
        .withEnv(new HashMap<String, String>() {
            {
                put("SERVICES", "sqs");
                put("START_WEB", "0");
            }
        })
        .withExposedPorts(4566).waitingFor(
            Wait.forLogMessage(".*Ready.*\\n", 1))
        .withStartupTimeout(Duration.ofSeconds(180));

    public static class TestProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            SQSAdapterIT.localstack.start();
            String containerUrl = "http://" + localstack.getHost() + ":" + localstack.getFirstMappedPort();
            return new HashMap<String, String>() {
                {
                    put("queue.provider", "sqs");
                    put("quarkus.sqs.endpoint-override", containerUrl);
                    put("quarkus.sqs.aws.region", "us-east-1");
                    put("quarkus.sqs.aws.credentials.type", "static");
                    put("quarkus.sqs.aws.credentials.static-provider.access-key-id", "AAEEII");
                    put("quarkus.sqs.aws.credentials.static-provider.secret-access-key", "AAEEII");
                }
            };

        }
    }


    @ConfigProperty(name = "quarkus.sqs.endpoint-override")
    String containerUrl;
    // ...
}

```

En resumen hicimos lo siguiente:

- Inyectamos el adaptador especifico implementado
- Configuramos el contenedor de *localstack*
- Definimos un perfil de prueba para sobrescribir el valor de `application.properties` para enlazarlo con nuestro contenedor.
- Anotamos la clase para que utilice este perfil de prueba.
- Rescatamos la url del contenedor para usarlo en nuestras pruebas.

Como la función de los adaptadores es limitada (comunicarse con la dependencia y adaptar cualquier resultado), los tests no presentan mayor dificultad.

Partamos con la creación de colas:

```java
@Test
public void testCreateQueue() {
        try {
                adapter.createQueue("test");
                Optional<String> queueUrl = adapter.getQueueUrl("test");
                Assertions.assertTrue(queueUrl.isPresent());
        } catch (Exception e) {
                Assertions.fail(e.getMessage());
        }

}
```

Como vemos, creamos una cola, y luego verificamos su existencia tratando de obtener su URL.

Probemos el envío y recepción de mensajes:

```java
@Test
public void testSendAndReceiveMessage() {
        try {
                adapter.createQueue("testSendMessage");
                Optional<String> queueUrl = adapter.getQueueUrl("testSendMessage");
                adapter.sendMessageWithAttributes(queueUrl.get(), "test", Map.of("key", "value"));
                List<QueueMessage> messages = adapter.receiveMessages(queueUrl.get(), 1);
                Assertions.assertEquals(1, messages.size());
                Assertions.assertEquals("test", messages.get(0).getMessage());
                Assertions.assertEquals("value", messages.get(0).getAttributes().get("key"));
        } catch (Exception e) {
                Assertions.fail(e.getMessage());
        }
}
```

En esta prueba creamos una cola especifica para el envio de mensajes, le mandamos uno y de inmediato hacemos polling para verificar que lo que enviamos coincide con lo que recibimos.

Probemos ahora la eliminación de mensajes:

```java
@Test
public void testDeleteMessage() {
    try {
        adapter.createQueue("testDeleteMessage");
        Optional<String> queueUrl = adapter.getQueueUrl("testDeleteMessage");
        adapter.sendMessage(queueUrl.get(), "test");
        List<QueueMessage> messages = adapter.receiveMessages(queueUrl.get(), 1);
        Assertions.assertEquals(1, messages.size());
        adapter.deleteMessage(queueUrl.get(), messages.get(0).getReceiptHandle());
        messages = adapter.receiveMessages(queueUrl.get(), 1);
        Assertions.assertEquals(0, messages.size());
    } catch (Exception e) {
        Assertions.fail(e.getMessage());
    }

}
```

Como podemos observar, mandamos un mensaje de prueba y hacemos polling dos veces, una para verificar que recibimos el mensaje y otra para asegurarnos que el mensaje recibido haya sido eliminado.

Por último, probemos la eliminación de colas:

```java
@Test
public void testDeleteQueue() {
        try {
                adapter.createQueue("testDelete");
                Optional<String> queueUrlBeforeRemoval = adapter.getQueueUrl("testDelete");
                adapter.deleteQueue(queueUrlBeforeRemoval.get());
                Optional<String> queueUrlAfterRemoval = adapter.getQueueUrl("testDelete");
                Assertions.assertFalse(queueUrlAfterRemoval.isPresent());
        } catch (Exception e) {
                Assertions.fail(e.getMessage());

        }
}
```

Como vemos, creamos una cola, obtenemos la url para verificar que efectivamente se creo, la eliminamos y volvemos a verificar, esperando que no exista la cola que habíamos creado.

</details>

Nuestro paquete está terminado. Ahora solo debemos ejecutar el siguiente comando en la raíz del proyecto:

```bash
mvn clean install
```

De esta manera instalaremos el paquete en el repositorio local y podrá ser accedido por otros proyectos.

# Conclusión

En este artículo levantamos un ambiente de desarrollo local e implementamos un adaptador para comunicarnos con el SDK de SQS, el cual será utilizado en los dos servicios que construiremos

Una vez realizado esto podemos desarrollar nuestros servicios. En la próxima parte desarrollaremos nuestro productor de mensajes.

