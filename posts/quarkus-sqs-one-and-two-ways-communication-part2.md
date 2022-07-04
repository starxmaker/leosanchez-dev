---
title: "[Parte 2] Comunicación unidireccional y bidireccional entre microservicios Quarkus a través de colas SQS: Productor de mensajes"
imageUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/quarkus-sqs-one-and-two-ways-communication/part2-cover.jpg"
thumbnailUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/quarkus-sqs-one-and-two-ways-communication/part2-thumbnail.jpg"
imageAuthorName: Mael Balland
imageAuthorUrl: https://unsplash.com/@mael_balland?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/queue?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022-02-01 09:49:01'
readingTime: 30
excerpt: "Continuamos la construcción del sistema de comunicación uni y bidireccional a través de SQS en Quarkus, en particular el productor o emisor de mensajes."
author: "Leonel Sánchez"
tags:
    - "Quarkus"
    - "Java"
    - "AWS"
    - "SQS"
    - "Comunicación bidireccional"
    - "Comunicación unidireccional"
---

*Esta es la segunda parte de tres artículos que explican la implementación de una comunicación uni y bidireccional a través de colas SQS en Quarkus.*

En el artículo anterior definimos un paquete que se comunica con el SDK de AWS y nos permite cierta abstracción. Definimos una serie de métodos que nos serán útiles en la implementación de una forma de comunicar uni y bidireccionalmente microservicios.

La comunicación está compuesta de roles, los cuales son indispensables para que pueda funcionar. En este artículo nos concentraremos en la construcción del primero de ellos, el emisor de mensajes, también conocido como productor.

## Inicialización

Primero inicialicemos el productor; es decir, la aplicación que comenzará la comunicación con la cola. Para hacerlo, basta ejecutar el siguiente comando:

```bash
quarkus create app dev.leosanchez:sqs-quarkus-producer
```

Lo anterior creará un proyecto Quarkus básico. Ingresamos a nuestro proyecto y modificamos el `pom.xml` y agregamos la dependencia creada en el artículo anterior.

```xml
<dependency>
      <groupId>dev.leosanchez</groupId>
      <artifactId>sqs-quarkus-common</artifactId>
      <version>1.0.0</version>
</dependency>
```
Una vez instaladas las dependencias, nos dirigimos al archivo `src/main/resources/application.properties` y especificamos las siguientes configuraciones:

```properties
queue.provider=sqs
# Optional
quarkus.http.port=8081
# Specify the created queues
twoways.queue.url=http://localhost:8010/queue/TwoWaysQueue
oneway.queue.url=http://localhost:8010/queue/OneWayQueue
quarkus.sqs.endpoint-override=http://localhost:8010
quarkus.sqs.aws.region=us-east-1
# WARNING: Never set your AWS credentials in your application code. Those are only for local development with localstack
quarkus.sqs.aws.credentials.type=static
quarkus.sqs.aws.credentials.static-provider.access-key-id=doesntmatter
quarkus.sqs.aws.credentials.static-provider.secret-access-key=doesntmatter
```

En este archivo estamos especificando lo siguiente:
- El adaptador de colas que utilizaremos.
- El puerto del servicio (colocamos uno distinto para no generar conflictos con el consumidor)
- Las colas creadas en el primer artículo
- El enlace a nuestro contenedor localstack
- Credenciales dummy para comunicarse con este servicio local.

**Nota importante: Jamás coloques tus credenciales de AWS en el código, sino que utiliza roles para ello. En este caso colocamos credenciales dummy para desarrollo local con localstack.**

### Configuración del servicio productor de mensajes

Partamos definiendo la la clase que contendrá nuestro servicio:

```java
@ApplicationScoped
public class QueueProducerService {
    
    // just a logger
    private static final Logger LOG = Logger.getLogger(QueueProducerService.class);

    // the sdk client
    @Inject
    IQueueAdapter queueAdapter;

    /** the name of the application to make queues with the same name as prefix
    NOTE: the property is received as optional because it is not inserted in the test profile and we want to test this class. */
    @ConfigProperty(name = "quarkus.application.name")
    Optional<String> applicationName;

    // the response queue that will be created after the initialization of the class
    private Optional<String> responseQueueUrl = Optional.empty();

    // a stack that will receive messages for all the service, no matter the request made
    private Map<String, String> messageStack = new HashMap<>();

    // a variable that will be used to store the polling task in order to check if
    // it was done
    private Future<Void> pollingFuture;
}
```

Como podemos ver, declaramos las siguientes cosas:
- Un logger
- Nuestro adaptador creado en el artículo anterior
- El nombre de la aplicación obtenido de la configuración (lo usaremos como prefijo para las colas temporales)
- La url de la cola temporal propia del servicio
- Una cola virtual que almacenará los mensajes por firma.
- Una variable que contedrá la ejecución actual del polling (y asi asegurarnos de solo realizar un polling a la vez)

<details>
<summary> Configuración de pruebas unitarias (opcional)</summary>

Antes de pasar a la implementación de cada método, construiremos una clase de pruebas unitarias que inyectará la clase que acabamos de crear y hará un mock del adaptador que creamos en el artículo anterior.

```java
@QuarkusTest
public class QueueProducerServiceTest {
    
    // the class that we want to test
    @Inject
    QueueProducerService queueService;

    // a mock of the sdk client
    @InjectMock
    IQueueAdapter queueClientAdapter;
}
```

Perfecto, volvamos a nuestro servicio.

</details>

Partamos con la funcionalidad que creará una cola temporal al inicio del servicio:

```java 
@PostConstruct // we make sure this is executed after the initialization of the class
public void createResponseQueue() {
    try {
        LOG.info("Initializing response queue");
        String projectName = applicationName.orElse("TEST");
        // we define a prefix for the generated response queues (Warning: queues cannot
        // have a name with a length with more than 80 characters)
        String prefix = projectName + "_RQ_TEMP_";
        // we create a unique name for the response queue
        String queueName = prefix + UUID.randomUUID().toString();
        // we receive the queue url
        responseQueueUrl = Optional.of(queueAdapter.createQueue(queueName));
    } catch (Exception e){
        LOG.error("Error creating response queue");
        e.printStackTrace();
        responseQueueUrl = Optional.empty();
    }
}
```

Como pueden observar, este método hace lo siguiente:

- Debido a su anotación, se ejecuta luego de ser instanciado la clase.
- Luego en su interior, definimos un prefijo: el nombre del servicio o "TEST" en su defecto.
- Luego defininmos el nombre de la cola: prefijo, tag y uuid único.
- Finalmente solicitamos la creación y guardamos la url generada en nuestro atributo.

<details>
<summary>Prueba unitaria (opcional)</summary>
Crearemos una prueba unitaria sencilla. Llamaremos a nuestro método y luego verificaremos que nuestro adaptador fue llamado con los datos correctos.

```java 
 @Test
public void testQueueCreation() throws QueueCreationException {
    // we call our provider class (this is going to be called  @PostConstruct)
    queueService.createResponseQueue();
    // we verify that the request has been made succesfully
    Mockito.verify(queueClientAdapter).createQueue(argThat((ArgumentMatcher<String>) matcher ->  matcher.startsWith("TEST_RQ_TEMP_")));
}
```

</details>

Por supuesto, no sería recomendable crear colas y no eliminarlas posteriormente pues nos llenaríamos de recursos basura. Por ello añadiremos una función para eliminarlas al destruir el objeto:

```java
@PreDestroy
public void deleteResponseQueue() {
    try {
        LOG.info("Deleting queue: " + responseQueueUrl);
        queueAdapter.deleteQueue(responseQueueUrl.get());
    } catch (Exception e) {
        LOG.error("Error while deleting queue", e);
    }
}
```

Como ven, nuestro método hace lo siguiente:

- Debido a su anotación, el método se ejecuta al destruirse la instancia de la clase (como es application scoped, esto ocurre al terminar el programa). 
- Luego envía una petición a AWS con la url de la cola que deseamos eliminar.

**NOTA IMPORTANTE: Si se ejecuta el código en una plataforma FaaS como Lambda, es posible que el código del PreDestroy no se ejecute. En estos casos hay que buscar otra forma para eliminar las colas basura. Una forma podría ser la de crear la cola temporal con un tag que especifique una fecha de expiración y que cada 30 minutos el servicio vaya actualizando este tag y por otro lado tener un servicio que cada cierto tiempo verifique las expiraciones de estas colas y elimine las vencidas. Para mantener la simplicidad, este tutorial no adentrará en este escenario.**

<details>
<summary> Pruebas unitarias (opcional) </summary>

Pasemos a nuestra clase de pruebas y escribamos un test unitario:

```java
@Test
public void testQueueDestruction() throws QueueRemovalException {
    // we call our provider class (this is going to be called  @PreDestroy)
    queueService.deleteResponseQueue();
    Mockito.verify(queueClientAdapter, times(1)).deleteQueue(Mockito.anyString());
    // we create the response queue again
    queueService.createResponseQueue();
}

```

Aquí ejecutamos el método y nos aseguramos que nuestro adaptador haya sido llamado. Luego creamos la cola nuevamente para las demás pruebas.

</details>

Pasemos ahora a la implementación del envío del mensaje. Este debe cumplir los siguientes requerimientos:

- Crear un identificador único que utilizaremos como firma y así poder identificar las respuestas a este mensaje.
- Luego, creamos una petición con el texto que le enviemos.
- Adjuntaremos a esta petición la url de la cola de respuestas y la firma creada.
- Enviaremos la petición a AWS.

No obstante, para realizar esto necesitamos la url de la cola de respuestas, la cual es muy probable que aún no haya sido creada si tomamos en cuenta que las inyecciones de beans con @ApplicationScoped son *lazy* por lo que ocurren en la primera petición que se haga al bean. Para prevenir un NullPointerException, crearemos una pequeña clase auxiliar que se encargará de retornar la url creada, y si aún no lo ha sido, esperarla:

```java
private Optional<String> retrieveResponseQueueUrl() {
    LOG.info("Retrieving current response queue");
    // if the value is null, lets wait until it is initialized
    while (responseQueueUrl.isEmpty()) {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
    if (responseQueueUrl.isEmpty()) {
        throw new Error("No response queue created");
    } else {
        LOG.infov("response queue created {0}", responseQueueUrl.get());
    }
    // so here we return the value only when we know it is initialized
    return responseQueueUrl;
}
```

Implementaremos dos métodos de envío de mensajes: uno esperando respuesta y otra que no. Empecemos con el primero:

```java
public void sendMessageForNoResponse(String targetQueueUrl, String message) throws MessageSendingException {
    LOG.info("Sending message " + message+" not expecting response");
    queueAdapter.sendMessage(targetQueueUrl, message);
}
```

Prácticamente toda la funcionalidad ya fue escrita, asi que solamente es un proxy a nuestro adaptador.

Ahora realicemos el método que envía mensajes en espera de una respuesta:

```java
public String sendMessageForResponse(String targetQueueUrl, String message) throws MessageSendingException {
    // we generate a signature
    String signature = UUID.randomUUID().toString();
    LOG.info("Sending message " + message+" expecting response");
    // we assign the attributes to the message
    Map<String, String> messageAttributes = new HashMap<>() {
        {
            put("ResponseQueueUrl", retrieveResponseQueueUrl().get()); // we make sure that it is initialized
            // we attach the generated signature to the message
            put("Signature", signature);
        }
    };
    // we send the message through our adapter
    queueAdapter.sendMessageWithAttributes(targetQueueUrl, message, messageAttributes);
    // we return the generated signature
    return signature;
}

```

A diferencia del método anterior, que no espera respuesta, nuestro método nos entrega un identificador para que podamos recibir el mensaje esperado. Este identificador es generado al momento de enviar el mensaje y se adjunta como atributo al mensaje enviado. También adjuntamos la url de la cola temporal de nuestro microservicio y así el destinatario sepa a quién responder.

<details>
<summary> Pruebas unitarias (Opcional)</summary>
Escribamos una prueba para nuestro nuevo método que espera respuesta:

```java
@Test
public void testSendMessage() throws MessageSendingException{
    // declaration of what are we going to send
    String message = "Bonjour";
    // we receive a signature from the method
    String signature = queueService.sendMessageForResponse("ABC", message);
    Mockito.verify(queueClientAdapter, times(1)).sendMessageWithAttributes(
        Mockito.eq("ABC"),
        Mockito.eq(message),
        argThat((ArgumentMatcher<Map<String, String>>) matcher -> matcher.get("Signature").equals(signature) && matcher.get("ResponseQueueUrl").contains("TEST_RQ_TEMP_"))
    );
}
```

Aquí definimos un mensaje, lo enviamos a una url imaginaria y verificamos que nuestro adaptador sea llamado con los parámetros correctos. Presten atención  en como me aseguro que la firma enviada coincide con la recibida y que la url de la cola de respuestas coincida con la estructura de la nuestra.
</details>

Perfecto, ahora pasemos al último método, que es quizás el más complejo: recibir mensajes. La lógica será la siguiente: 

- Con la firma recibida, pediremos al método que busque el mensaje de respuesta correspondiente. 
- Nuestra clase proveedora buscará el mensaje en una lista local.  
- Si esta no tiene el elemento, se solicitará automáticamente un polling de mensajes, el cual llamará a SQS y traerá todos los mensajes de la cola creada, tengan nuestra firma o no. Si ya hay un polling en ejecución, no ejecutaremos uno nuevo.
- Este polling escribirá los mensajes a la lista y los eliminará de la cola SQS.
- Nosotros seguiremos esperando el mensaje verificando la presencia de la firma en esta lista local hasta que se cumpla el timeout especificado.

Para lograr lo anterior, definamos algunas funciones auxiliares:

Primero definamos una función que busque un mensaje de cierta firma en la lista de mensajes:

```java
private Optional<String> findMessage(String signature) {
    LOG.info("Finding message");
    String response = messageStack.get(signature);
    if (Objects.nonNull(response)) {
        // if there is a message with the signature, we remove it from the list and we
        // return it
        messageStack.remove(signature);
        return Optional.of(response);
    }
    return Optional.empty();
}
```

Por último, creamos el método auxiliar que hará el polling a SQS.

```java
private void pollMessages() throws MessagePollingException {
    LOG.info("Polling messages");
    // we prepare the request
    List<QueueMessage> messages = queueAdapter.receiveMessages(responseQueueUrl.get(), 10);
    if (messages.size() > 0) {
        LOG.info("Messages received");
        for (QueueMessage message : messages) {
            Map<String, String> attributes = message.getAttributes();
            String signature = attributes.get("Signature");
            if (Objects.nonNull(signature)) {
                messageStack.put(signature, message.getMessage());
            }
            try{
                // we remove it from the queue
                queueAdapter.deleteMessage(responseQueueUrl.get(), message.getReceiptHandle());
            } catch (MessageRemovalException e) {
                LOG.error("Error removing message");
                e.printStackTrace();
            }
        }
    } else {
        LOG.info("No messages");
    }
}

```

En resumen, llamamos a nuestro adaptador para hacer polling. Si se reciben mensajes, los guardamos en nuestro mapa con la entrada de la firma. Por último eliminamos el mensaje de nuestra cola de respuesta para no recibirlo nuevamente.

Perfecto, ahora sí podemos pasar a la implementación del último método de nuestra interfaz:

```java
public Optional<String> receiveResponse(String signature, Integer secondsToTimeout)  {
    LOG.info("Awaiting response");
    // we poll for the messages in another thread
    ExecutorService waiterExecutor = Executors.newSingleThreadExecutor();
    Optional<String> receivedMessage = Optional.empty(); // if timeout, it will return null
    try {
        // we create a future that will wait for the response
        CompletableFuture<Optional<String>> future = CompletableFuture.supplyAsync(() -> {
            Optional<String> response = findMessage(signature);
            while (response.isEmpty()) {
                LOG.info("Message not found, polling");
                // if the variable that contains the polling task is not null and it is not done, then wait
                if (Objects.nonNull(pollingFuture) && !pollingFuture.isDone()) {
                    LOG.info("There is already a polling in progress, so waiting");
                    try {
                        Thread.sleep(1000);
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                        return Optional.empty();
                    }
                } else {
                    // if the variable is null or it is done, then we start a new polling task
                    LOG.info("A new polling will be executed");
                    pollingFuture = CompletableFuture.runAsync(() -> {
                        try {
                            pollMessages();
                        } catch (MessagePollingException e) {
                            throw new RuntimeException(e);
                        }
                    });
                }
                response = findMessage(signature);
            }
            return response;
        }, waiterExecutor);
        receivedMessage = future.get(secondsToTimeout, TimeUnit.SECONDS); // here we wait for the response
    } catch (Exception e) {
        // if there is an error, we print the stacktrace
        LOG.error("Timeout");
        e.printStackTrace();
    } finally {
        // we terminate the thread created
        waiterExecutor.shutdownNow();
    }
    // we return the received message or null if error
    return receivedMessage;
}

```

Este es uno de los métodos más complejos. Podemos ver que nuestra función cumple con nuestros requerimientos:
- Primero crea un hilo nuevo para esperar la respuesta y no bloquear el actual.
- Verificamos si el mensaje ya se encuentra en nuestra lista local. Si se encuentra lo retorna de inmediato.
- Ordenamos una ejecución de la tarea de polling si es que no hay una creada. Si hay una creada, esperamos.
- Volvemos a buscar el mensaje en la lista y repetimos los pasos anteriores hasta que se retorne un mensaje o se acabe el tiempo.
- Hacemos limpieza del hilo creado.
- Si se recibió el mensaje se retorna como cadena de texto. Si no, se retorna null.

<details>
<summary> Pruebas unitarias (opcional) </summary>

Finalmente, pasemos a escribir algunas pruebas unitarias: una para verificar un envío simple, otro concurrente, uno con timeout y finalmente la eliminación de mensajes.

Primero, actualicemos nuestro método de BeforeEach para agregar un nuevo método mock, que simulará una lista de mensajes recibidos al hacer polling:

```java
 // here we are going to mock some responses of the sdk client
@BeforeEach
public void beforeEach() throws MessagePollingException{
    // mock creation

    Mockito.when(
        queueClientAdapter.receiveMessages(Mockito.anyString(), Mockito.anyInt())
    ).thenReturn(
        List.of(
            new QueueMessage("Au revoir", "FR_00000001", new HashMap<String, String>() {
                {
                    put("Signature", "FR");
                }
            }),
            new QueueMessage("Good bye", "EN_00000001", new HashMap<String, String>() {
                {
                    put("Signature", "EN");
                }
            })
        )      
    );
}

```

Como puede observarse, verificamos que la petición al SDK se haga con los parámetros esperados y retornamos dos mensajes de despedida, uno en inglés y otro en francés, con sus respectivas firmas.

Perfecto, pasemos a implementar las pruebas:

```java
@Test
public void testAwaitResponseSimple(){
    // we declare what we expect to receive (we already configured the mock to generate the same values)
    String signature = "EN";
    String expectedResponse = "Good bye";
    // we call our provider
    Optional<String> response = queueService.receiveResponse(signature, 10);
    // we verify that the mocked response is returned
    Assertions.assertEquals(response.get(), expectedResponse);
}
```

Acá probamos la recepción correcta del mensaje (en este caso la despedida en inglés).

Perfecto, pasemos a la prueba concurrente:

```java
@Test
public void testAwaitResponseConcurrent() throws MessagePollingException{
    // we declare what we expect to receive (we already configured the mock to generate the same values)
    String signature = "EN";
    String signatureConcurrent= "FR";
    String expectedResponse = "Good bye";
    String expectedResponseConcurrent = "Au revoir";
    
    // we call our provider
    Optional<String> response = queueService.receiveResponse(signature, 10);
    Optional<String> responseConcurrent = queueService.receiveResponse(signatureConcurrent, 10);

    // we verify that the service was called only once
    Mockito.verify(queueClientAdapter, Mockito.times(1)).receiveMessages(Mockito.anyString(), Mockito.anyInt());

    // we verify that the mocked response is returned
    Assertions.assertEquals(response.get(), expectedResponse);
    Assertions.assertEquals(responseConcurrent.get(), expectedResponseConcurrent);
}


```

Esta prueba es mucho más compleja que la anterior. Esperamos recibir la despedida en inglés y francés. Verificamos que a pesar de ser dos peticiones, solo se haga una llamada al SDK y confirmamos que las respuestas recibidas correspondan con las esperadas.

Pasemos al timeout:

```java
@Test
public void testAwaitResponseTimeout() {
    // a non existing signature (according to what we have declared)
    String signature = "ES";

    // more than enought to check timeout in unit testing
    Integer timeoutSeconds = 1;

    // we register when we start the method
    Long start = System.currentTimeMillis();
    // we call the method
    Optional<String> response = queueService.receiveResponse(signature, timeoutSeconds);
    // we register the end of the execution
    Long end = System.currentTimeMillis();

    // we verify that the response is null
    Assertions.assertTrue(response.isEmpty());
    // we verify that the execution time is greater or equal than the specified timeout
    // we will round, because some milliseconds could pass after or before the execution
    Assertions.assertTrue(Math.floorDiv(end-start, 1000) == timeoutSeconds);   
}

```

Aquí estamos esperando una respuesta que no definimos en nuestro mock (una despedida en español), por lo que esperará hasta que dé timeout. Verificaremos efectivamente que el tiempo que se demore sea el timeout que especificamos (con algunos milisegundos más).

Finalmente, pasemos a la prueba de eliminación de mensajes de la cola de AWS:

```java
@Test
public void testMessageRemoval() throws MessageRemovalException{
    // we declare a message that is previously declared in the mock to be received (as removal happens after receiving)
    String signature = "FR";
    String receiptHandle = "FR_00000001";
    
    // we call our class
    queueService.receiveResponse(signature, 10);

    // we verify that a removal was requested with the right parameters
    Mockito.verify(queueClientAdapter, Mockito.times(1)).deleteMessage(Mockito.eq(queueService.getResponseQueueUrl().get()), Mockito.eq(receiptHandle));
}
```
Acá verificamos que el mensaje que se elimine de la cola sea precisamente el mensaje que estamos esperando (obviamente tras su recepción).

</details>

Pasemos finalmente a la construcción del recurso y servicio que se comunicarán con nuestra cola.

### Construcción del endpoint y servicio

Primero definimos la clase del servicio, e inyectamos las colas de mensajería y la clase proveedora que acabamos de escribir.

    @ApplicationScoped
    public class CoordinatesService {
        
        @ConfigProperty(name = "twoways.queue.url")
        String twoWaysQueueUrl;

        @ConfigProperty(name = "oneway.queue.url")
        String onewayResponseQueueUrl;

        @Inject
        IQueueProvider queueProvider;

    }

<details>
<summary> Definición de clase de pruebas unitarias (opcional) </summary>

Por supuesto que escribiremos una clase de pruebas unitarias. Inyectaremos nuestro servicio, pero haremos mock del proveedor.

```java
@QuarkusTest
public class CoordinatesServiceTest {

    // we inject the service we want to test
    @Inject
    CoordinatesService service;

    // we mock our provider
    @InjectMock
    IQueueProvider queueProvider;

}
```

Por último, configuremos algunos métodos mocks de nuestro proveedor.

```java

// we implement some mock methods
@BeforeEach
public void setup() throws MessageSendingException {
    JsonObject response = new JsonObject();
    response.put("lat", -34.397);
    response.put("lon", 150.644);

    // we configure some signature responses
    Mockito.when(queueService.sendMessageForResponse(
        Mockito.anyString(),
        argThat(matcher -> matcher.contains("Coquimbo") || matcher.contains("Santiago"))
    )).thenAnswer(answer -> {
        if (answer.getArgument(1).toString().contains("Coquimbo")) {
            return "CQBO";
        } else {
            return "STGO";
        }
    });
    // the first signature will return a response, the second will not
    Mockito.when(queueService.receiveResponse(
        argThat(matcher -> matcher.equals("CQBO") || matcher.equals("STGO")
    ), Mockito.anyInt())).thenAnswer(answer -> {
        if (answer.getArgument(0).equals("CQBO")) {
            return Optional.of(response.toString());
        } else {
            return Optional.empty();
        }
    });
}
```

En resumen, configuramos que nos retorne ciertas firmas cuando mandamos ciertos mensajes y que cuando esperemos la respuesta, solo una nos retorne coordenadas y la otra no.

Volvamos a nuestro servicio.
</details>

Ahora implementemos algunas llamadas a las colas:

Primero definiremos una llamada bidireccional consultando direcciones por un nombre y esperando las coordenadas de vuelta:

```java
public Optional<JsonObject> queryCoordinates(String city) {
    // we build the request
    JsonObject request = new JsonObject();
    request.put("city", city);

    try {
    // we send the request and keep the signature
    String signature = queueService.sendMessageForResponse(twoWaysQueueUrl, request.toString());
    //we await the message just for 30 seconds
    Optional<String> response = queueService.receiveResponse(signature, 30);

    // we parse and return the response
    return response.isPresent()? Optional.of(new JsonObject(response.get())) : Optional.empty();
    } catch (MessageSendingException e) {
        return Optional.empty();
    }
}
```

Como podemos ver, manda el parámetro de ciudad como un objeto y envía el mensaje. Con la firma recibida se espera una respuesta y se envía en el caso de recibirla.

<details>
<summary> Pruebas unitarias (opcional) </summary>
Pasemos a probar nuestro nuevo método:

```java
@Test
public void testQueryCoordinates() {
    Optional<JsonObject> response = service.queryCoordinates("Coquimbo");
    Assertions.assertEquals(response.get().getDouble("lat"), -34.397);
    Assertions.assertEquals(response.get().getDouble("lon"), 150.644);
}
```

Primero definimos una prueba simple para cuando encuentre el resultado y retorne las coordenadas.

Luego implementemos una prueba en la que no recibiremos respuesta:

```java
@Test
public void testNotFoundCoordinates() {
    Optional<JsonObject> response = service.queryCoordinates("Santiago");
    Assertions.assertTrue(response.isEmpty());
}
```

Muy simple, si no existen, retorna vacío.

</details>

Vamos a implementar un último método de comunicación con colas, pero será unidireccional para publicar nuevas coordenadas.

```java
public void submitCoordinates(String name, Double lat, Double lon) {
    JsonObject request = new JsonObject();
    request.put("name", name);
    request.put("lat", lat);
    request.put("lon", lon);
    try {
        queueService.sendMessageForNoResponse(onewayResponseQueueUrl, request.toString());
    } catch (MessageSendingException e) {
        e.printStackTrace();
    }
}
```

Simple, construimos un objeto con el nombre de la ciudad y sus coordenadas y lo enviamos a la cola. Como es unidireccional, no es necesario esperar respuesta ni firma alguna.

<details>
<summary> Pruebas unitarias (opcional) </summary>
Implementemos la prueba unitaria:

```java
@Test
public void testSubmitCoordinates() throws MessageSendingException {
    service.submitCoordinates("Santiago", -34.397, 150.644);
    Mockito.verify(queueService, Mockito.times(1)).sendMessageForNoResponse(
        Mockito.anyString(),
        argThat(matcher -> {
            JsonObject request = new JsonObject(matcher);
            return request.getString("name").equals("Santiago") &&
                request.getDouble("lat").equals(-34.397) &&
                request.getDouble("lon").equals(150.644);
        })
    );
}
```

Aquí comprobamos que el mensaje que enviamos contenga lo deseado al momento de comunicarse con nuestro servicio de colas.

</details>

Por último pasemos a implementar los endpoints. No entraré en muchos detalles, ya que solo se encargan de comunicarse con nuestro servicio:

```java
@Path("/coordinates")
public class CoordinatesResource {
    @Inject
    CoordinatesService coordinatesService;

    // endpoint for two way communication
    @GET
    @Path("/search/{query}")
    @Produces(MediaType.APPLICATION_JSON)
    public Response query(@PathParam("query") String query) {
        
        Optional<JsonObject> messageReceived = coordinatesService.queryCoordinates(query);
        if (messageReceived.isPresent()) {
            return Response.ok(messageReceived.get()).build();
        } else {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        
    }

    // endpoint for one way commmunication
    @POST
    @Path("/submit")
    @Produces(MediaType.APPLICATION_JSON)
    public Response post(JsonObject body) {
        try {
            coordinatesService.submitCoordinates(body.getString("name"), body.getDouble("lat"), body.getDouble("lon"));
            return Response.ok().build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
    }
}

```

Perfecto, hemos finalizado nuestro productor.

# Conclusión

En este segundo artículo pudimos configurar el mecanismo subyaciente de nuestro productor de mensajes, el cual puede ser rápidamente llamado por otros servicios que lo requieran. Para mostrar su funcionamiento, también creamos un cliente que se utiliza nuestro productor para enviar mensajes a nuestro futuro consumidor, el cual construiremos en el próximo artículo, y para recibir las respuestas que este pueda generar.
