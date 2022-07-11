---
title: "[Parte 3] Comunicación unidireccional y bidireccional entre microservicios Quarkus a través de colas SQS: Consumidor de mensajes"
imageUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-sqs-one-and-two-ways-communication/part3-cover.jpg"
thumbnailUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-sqs-one-and-two-ways-communication/part3-thumbnail.jpg"
imageAuthorName: Myznik Egor
imageAuthorUrl: https://unsplash.com/@shnautsher?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/queue?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022/02/01 09:49:02'
readingTime: 30
excerpt: "Esta es la última parte de la serie de artículos que abordan la construcción de un sistema para comunicación uni y bidireccional a través de SQS en Quarkus. En este artículo se aborda la construcción del consumidor."
author: "Leonel Sánchez"
tags:
    - "Quarkus"
    - "Java"
    - "AWS"
    - "SQS"
    - "Comunicación bidireccional"
    - "Comunicación unidireccional"
---

Esta es la última parte de la serie de tres artículos destinados a la construcción de un sistema de comunicación uni y bidireccional a través de SQS en Quarkus. En los anteriores artículos realizamos una librería con el código en común para los microservicios involucrados como el productor de mensajes de la cola.

En la comunicación, de nada sirve que alguien emita mensajes si no hay nadie que los escuche. Por ello, ahora construiremos el receptor de mensajes, también llamado consumidor. Si bien es cierto es que la lógica del consumidor no es tan compleja si nos vamos por el camino imperativo, esto generaría mucho código innecesario por cada listener que definamos. Por ello, usaremos un poco de tiempo extra para irnos por el camino declarativo y enlazar listeners con solo una anotación.

## Inicialización

Primero ejecutamos el siguiente comando:

```bash
quarkus create app dev.leosanchez:sqs-quarkus-consumer
```

Luego vamos a nuestro `pom.xml` y agregamos la dependencia base que creamos en el primer artículo:

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
- Las colas creadas en el primer artículo
- El enlace a nuestro contenedor localstack
- Credenciales dummy para comunicarse con este servicio local.

**Nota importante: Jamás coloques tus credenciales de AWS en el código, sino que utiliza roles para ello. En este caso colocamos credenciales dummy para desarrollo local con localstack.**

### Configuración del servicio consumidor de mensajes de la cola

Empecemos con la construcción del servicio consumidor de mensajes, el cual es mucho más sencillo que el productor, pues solo debe preocuparse de hacer polling y mandar respuestas:

```java
@ApplicationScoped
public class QueueConsumerService {

    private static final Logger LOG = Logger.getLogger(QueueConsumerService.class);

    @Inject
    IQueueAdapter queueAdapter;
    // ...
}
```

<details>
<summary> Configuración para las pruebas unitarias (opcional)</summary>

Perfecto, ahora implementemos una clase para las pruebas unitarias:

```java
@QuarkusTest
public class QueueConsumerServiceTest {

    String queueUrl = "https://parentQueue.com/testQueue";
   
    @Inject
    QueueConsumerService service;
    
    @InjectMock
    IQueueAdapter adapter;
    // ...
}
```

Aquí definimos una url dummy para hacer pruebas con el consumidor, inyectamos el servicio que acabamos de crear e inyectamos como mock el adaptador de colas.

</details>

Ahora pasemos al primer método: recibir mensajes o polling. Esta clase es más simple que la del productor debido a que no debemos complicarnos con la operación de colas virtuales:

```java
public List<QueueMessage> pollMessages(String queueUrl, int maxNumberOfMessages) throws MessagePollingException {
    List<QueueMessage> messages = queueAdapter.receiveMessages(queueUrl, maxNumberOfMessages);
    messages.forEach(message -> {
        LOG.info("Received message " + message.getMessage());
        // we delete the message
        try{
            queueAdapter.deleteMessage(queueUrl, message.getReceiptHandle());
        } catch (MessageRemovalException e) {
            throw new RuntimeException(e);
        }
    });
    return messages;
}
```

Nuestra función se comunica con el adaptador para recibir los mensajes y si los recibe los va eliminando de la cola original.


<details>
<summary> Pruebas unitarias (opcional) </summary>

Pasemos a las pruebas. Antes de escribirlas, hagamos un mock de la llamada al adaptador al momento de hacer polling:

```java
@BeforeEach
public void beforeEach() throws MessagePollingException{
    // mock message receive
    Mockito.when(
        adapter.receiveMessages(Mockito.eq(queueUrl), Mockito.anyInt())
    ).thenReturn(
        List.of(
            new QueueMessage("Au revoir", "FR_00000001", new HashMap<String, String>() {
                {
                    put("Signature","FR");
                    put("ResponseQueueUrl", "https://targetqueue.com/testQueue");
                }
            }),
            new QueueMessage("Good bye", "EN_00000001", new HashMap<String, String>() {
                {
                    put("Signature","EN");
                    put("ResponseQueueUrl", "https://targetqueue.com/testQueue");
                }
            })
        )
    );
}

```

Como podemos apreciar, simulamos una respuesta de un polling, trayendo mensajes tal como los recibiriamos si fuesen emitidos por el productor; es decir, con firma y cola temporal de respuesta.

Ahora sí, implementemos nuestra primera prueba:

```java
@Test
public void pollMessages() throws MessagePollingException {
    List<QueueMessage> messages =service.pollMessages(queueUrl, 10);
    Assertions.assertEquals(2, messages.size());
    Assertions.assertEquals("Au revoir", messages.get(0).getMessage());
    Assertions.assertEquals("https://targetqueue.com/testQueue", messages.get(0).getAttributes().get("ResponseQueueUrl"));
    Assertions.assertEquals("FR", messages.get(0).getAttributes().get("Signature"));
    Assertions.assertEquals("Good bye", messages.get(1).getMessage());
    Assertions.assertEquals("https://targetqueue.com/testQueue", messages.get(1).getAttributes().get("ResponseQueueUrl"));
    Assertions.assertEquals("EN", messages.get(1).getAttributes().get("Signature"));
}
```

Simplemente verificamos que los mensajes recibidos contengan los elementos que configuramos en el mock

Ahora probemos la eliminación del mensaje en la cola original:

```java
@Test
public void deleteMessages() throws MessageRemovalException, MessagePollingException {
    service.pollMessages(queueUrl, 10);
    Mockito.verify(adapter, Mockito.atLeastOnce()).deleteMessage(Mockito.eq(queueUrl), Mockito.eq("FR_00000001"));
    Mockito.verify(adapter, Mockito.atLeastOnce()).deleteMessage(Mockito.eq(queueUrl), Mockito.eq("EN_00000001"));
}
```

Aquí verificamos que el método se haya llamado al menos dos veces y las eliminaciones correspondan con los mensajes que recibimos.

</details>

Perfecto, pasemos ahora a la implementación del envío de mensajes:

```java
public void sendAnswer(String sourceQueueUrl, String responseMessage, String signature)  throws MessageSendingException{
    LOG.info("Sending message " + responseMessage);
    Map<String, String> attributes = new HashMap<>() {
        {
            put("Signature", signature);
        }
    };
    LOG.info("url" + sourceQueueUrl);
    queueAdapter.sendMessageWithAttributes(sourceQueueUrl, responseMessage, attributes);
}
```

Como ven, hacemos una petición adjuntando como atributo la firma del mensaje original y se envía a la cola que se especificó en el cliente.

<details>
<summary> Prueba unitaria (opcional) </summary>
Pasemos a la prueba:

```java
@Test
public void sendAnswer() throws MessageSendingException {
    service.sendAnswer("https://targetqueue.com/testQueue", "Hello", "FR");
    Mockito.verify(adapter, Mockito.times(1)).sendMessageWithAttributes(
        Mockito.eq("https://targetqueue.com/testQueue"),
        Mockito.eq("Hello"),
        Mockito.argThat((ArgumentMatcher<Map<String, String>>) matcher -> matcher.get("Signature").equals("FR"))
    );    
}
```

Aquí verificamos que la petición al adaptador sea correcta y que la firma corresponda con el mensaje enviado.

</details>

Y hemos terminado el servicio consumidor. Sin embargo, el polling continuo y dirección al método que manejará cada cola será responsabilidad del lanzador de listeners.

### Configuración del lanzador de listeners

Ahora debemos implementar una forma de orquestar estos métodos para cada una de las colas que deseemos gestionar. Implementaremos un lanzador que después nos permita agregar nuestros listeners de forma declarativa.

Primero, crearemos un qualifier que nos permitirá inyectar con mayor facilidad los listener que deseamos crear:

```java
@Qualifier
@Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
@Target({ java.lang.annotation.ElementType.TYPE, java.lang.annotation.ElementType.FIELD })
public @interface ListenerQualifier {
    // here we define the metadata we want to attach to the message polling and processing
    @Nonbinding String urlProperty() default "";
     // if we want to process the messages in parallel or in sequence
    @Nonbinding boolean parallelProcessing() default true;
    // the maximum number of messages the listener will handle per polling
    @Nonbinding int maxNumberOfMessagesPerProcessing() default 10; 
    // a way to ensure that each processing at least take some time 
    @Nonbinding int minProcessingMilliseconds() default 0; 
}

```

Como pueden observar, adjuntamos ciertos metadatos que nos permitirán personalizar nuestro proceso de polling y respuesta. Primero, indicamos la propiedad de la url de la cola (que debe estar en `application.properties`) a la cual nuestro lanzador irá a buscar la url. Asimismo, permitimos personalizar si deseamos un procesamiento de mensajes en paralelo o en secuencia, cuántos mensajes deseamos recibir como máximo en cada polling y el tiempo mínimo de cada procesamiento.

Ahora implementaremos una pequeña interfaz que indicará la estructura que tendrán que tener nuestros listeners.

```java
public interface IListener {
    public Optional<String> process(String message);
}
```

En realidad solo necesitamos indicar cuál será el método que procesará cada mensaje.

Asimismo, también definamos una clase para portar los mismos datos, pero sin depender de nuestra interfaz y facilitar así su manejo:

```java
@RegisterForReflection
public class ListenRequest {
    IListener listener;
    String queueUrl;
    boolean parallelProcessing;
    Integer maxMessagesPerPolling;
    Integer minExecutionMilliseconds;

    public ListenRequest(IListener listener, String queueUrl, boolean parallelProcessing, Integer maxMessagesPerPolling, Integer minExecutionMilliseconds) {
        this.listener =  listener;
        this.queueUrl = queueUrl;
        this.parallelProcessing = parallelProcessing;
        this.maxMessagesPerPolling = maxMessagesPerPolling;
        this.minExecutionMilliseconds = minExecutionMilliseconds;
    }

    public IListener getListener() {
        return listener;
    }

    public String getQueueUrl() {
        return queueUrl;
    }

    public boolean isParallelProcessing() {
        return parallelProcessing;
    }

    public Integer getMaxMessagesPerPolling(){
        return maxMessagesPerPolling;
    }

    public Integer getMinExecutionMilliseconds(){
        return minExecutionMilliseconds;
    }
}
```

Como ven, es una clase básica que ingresa los datos del qualifier en el constructor y expone gets para su acceso.

Ahora implementemos el servicio lanzador:

```java
@ApplicationScoped
@Startup
public class ListenerLauncherService {

    // a simple logger
    private static Logger LOG = Logger.getLogger(ListenerLauncherService.class);

    // our listeners injected and filtered by the qualifier
    @ListenerQualifier
    Instance<IListener> partialListeners;

    // the provider we implemented
    @Inject
    QueueConsumerService queueConsumerService;
    // ..
}
```

Creamos una clase lanzadora de listeners que se instanciará al comienzo de la aplicación. Le inyectamos un logger simple, nuestros listeners marcados con nuestra anotación y nuestro servicio de comunicación con el SDK de SQS. 

La lógica de lo que vamos a implementar es la siguiente:

- Extraeremos la información de nuestro listener y anotación y lo guardaremos en un objeto ListenRequest.
- Crearemos una estructura que lleve registro del último polling de cada cola.
- En un hilo separado verificaremos si cada cola tiene un polling activo, y si no lo tiene lanza uno en un nuevo hilo (delegamos la administración de hilos a CompletableFuture)
- En cada polling, procesaremos cada mensaje con el método `process` de cada uno de nuestros objetos basados en ´IListener´ y si este último entrega una respuesta, enviarla a la cola de origen.

Comencemos con el último punto, al que llamaremos procesamiento de mensajes y envío de respuesta. Para lograr esto implementaremos el siguiente método:

```java
private void onMessage(QueueMessage message, IListener listener, int minProcessingMilliseconds) {
    Long startExecution = System.currentTimeMillis();
    // we invoke the method
    Optional<String> response = listener.process(message.getMessage());
    // if the response was not null we send it to the source queue according to its signature
    if (response.isPresent()) {
        String sourceQueueUrl = message.getAttributes().get("ResponseQueueUrl");
        String signature = message.getAttributes().get("Signature");
        if (Objects.nonNull(sourceQueueUrl) && Objects.nonNull(signature)) {
            try {
                queueConsumerService.sendAnswer(sourceQueueUrl, response.get(), signature);
            } catch (Exception e) {
                LOG.error("Error sending message");
                e.printStackTrace();
            }
        } else {
            LOG.error("ResponseQueueUrl or Signature not found in message attributes");
        }
    }
    // if the execution time was lower than the min expected, sleep
    Long currentTime = System.currentTimeMillis();
    if (currentTime - startExecution < minProcessingMilliseconds) {
        LOG.infov("Waiting for {0} ms",
                minProcessingMilliseconds - (currentTime - startExecution));
        try {
            Thread.sleep(minProcessingMilliseconds - (currentTime - startExecution));
        } catch (InterruptedException e) {
            LOG.error("Interrupted while waiting for minimum execution time");
            e.printStackTrace();
        }
    }
}
```

En resumen este método hace lo siguiente:

- Recibo un mensaje, la instancia de su listener y el tiempo mínimo de procesamiento de mensaje (por defecto 0)
- Obtengo el timestamp de comienzo del procesamiento
- Invoco al método process del listener
- Si retorna un mensaje, envío una respuesta de acuerdo a los atributos del mensaje original.
- Si el procesamiento se demoró menos que el tiempo mínimo de procesamiento, duermo hasta que se cumpla este periodo.

Perfecto, ahora pasemos a la función que hará el polling de mensajes y los conducirá a la función que acabo de implementar:

```java
private void performPolling(ListenRequest request) throws MessagePollingException {
    LOG.info("polling messages for queue " + request.getQueueUrl());
    // we poll messages from the queue
    List<QueueMessage> messages = queueConsumerService.pollMessages(request.getQueueUrl(),
            request.getMaxMessagesPerPolling());
    if (messages.isEmpty()) {
        LOG.info("No messages received for queue" + request.getQueueUrl());
    } else {
        // if we receive a message, we start processing
        LOG.info("Received " + messages.size() + " messages");
        // we configure a consumer for the messages we receive
        Consumer<QueueMessage> consumer = message -> {
            onMessage(message, request.getListener(), request.getMinExecutionMilliseconds());
        };
        // if we configured parallel processing, we use it
        if (request.isParallelProcessing()) {
            messages.parallelStream().forEach(consumer);
        } else {
            // if not, the messages will be processed sequentially
            messages.stream().forEach(consumer);
        }
    }
}
```

En palabras simples nuestra función hace lo siguiente:

- Recibimos un objeto ListenRequest que contiene todo lo necesario para el proceso.
- Realizamos polling de acuerdo a la cantidad máxima de mensajes que esperamos recibir.
- Si encuentra mensajes, definimos un consumidor que llame a nuestro método de procesamiento de mensaje que acabamos de definir y lo llamamos de forma paralela o secuencial de acuerdo con nuestra configuración.

Perfecto. Ahora necesitamos un método gestor de ejecuciones de polling. 

```java
public void orchestrateListeners(List<ListenRequest> requests, Integer pollingQuantity) {
    // here we will store the current executions
    Map<String, Future<?>> currentExecutions = new HashMap<>();
    // we will also keep a record of the quantity of the pollings performed per listener
    Map<String, Integer> pollingRecord = requests.stream().collect(Collectors.toMap(ListenRequest::getQueueUrl, e -> 0));
    // we keep a record of suspensions in case a polling fails
    Map<String, Long> queuePollingSuspension = new HashMap<>();
    Long failingSuspension = 5 * 60 * 1000L;
    
    // iterate continuosly  or until iterations are done
    while (Objects.isNull(pollingQuantity) || !pollingRecord.values().stream().allMatch(p -> p >= pollingQuantity)) {
        // we iterate each request extracted
        for (ListenRequest request : requests) {
            // we check how much pollings have been done for this request
            Integer currentIterations = pollingRecord.get(request.getQueueUrl());
            if (! queuePollingSuspension.containsKey(request.getQueueUrl()) ||  queuePollingSuspension.get(request.getQueueUrl()) < System.currentTimeMillis()) {
                // if we dont limit the number of pollings or  if the current number of pollings is less than the one desired, continue
                if (Objects.isNull(pollingQuantity) || currentIterations <  pollingQuantity ) {
                    // we verify if there is a current execution for this request
                    Future<?> currentTask = currentExecutions.get(request.getQueueUrl());
                    // if there is no execution or if the current execution is done, run a new one for the request
                    // if there is an execution not done, we skip this request and in a new execution we will check if it is finished
                    if (Objects.isNull(currentTask) || currentTask.isDone()) {
                        // we define and run the new task
                        Future<?> currentExecution = CompletableFuture.runAsync(() -> {
                            try {
                                performPolling(request);
                            } catch (Exception e) {
                                e.printStackTrace();
                                LOG.error("Polling for " + request.getQueueUrl() + " failed, retrying in "+failingSuspension+" milliseconds");
                                queuePollingSuspension.put(request.getQueueUrl(), System.currentTimeMillis() + failingSuspension);
                            }
                        });
                        // we save it on our records
                        currentExecutions.put(request.getQueueUrl(), currentExecution);
                        // if the polling quantity param was specified, then update the polling records
                        if(Objects.nonNull(pollingQuantity)) {
                            pollingRecord.put(request.getQueueUrl(), currentIterations + 1);
                        }
                    }
                }
            }
        }
    }
    // once the polling limit is reached, we wait for the current executions to finish
    for (Future<?> future : currentExecutions.values()) {
        try {
            future.get();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

Este método es quizás el más complejo. Lo que hace es lo siguiente:

- Recibimos la lista de ListenRequest con todo lo necesario para el proceso.
- Asimismo, recibimos la cantidad de pollings que deseamos hacer por cola. Si es nulo, no hay límite. Este parámetro se incluye para facilitar las pruebas unitarias.
- Creamos una estructura que llevará registro del polling de cada cola.
- Asimismo, creamos e inicializamos una estructura que contará la cantidad de pollings por cada cola (solamente si establecimos un límite).
- De forma indefinida o hasta que se alcance el límite de pollings deseados, iteramos la lista de listeners.
- Por cada listener, primero verifico si no he alcanzo el límite en caso de definirlo.
- Luego, verifico si hay un polling en curso. Si lo hay, ignoro y continúo.
- Si no hay polling o el polling ya terminó, lanzo un nuevo polling.
- Si definí un límite de pollings, actualizo la cantidad de pollings realizadas para la cola actual.
- Por último, si se rompe nuestra iteración (cuando defino un límite de pollings), verifico que los últimos pollings registrados concluyan de la manera esperada.

Perfecto, ahora necesitamos un método que extraiga la información de nuestro listener y su anotación. No obstante, para obtener eso, primero necesito un traductor de nombres de clase debido a que Quarkus no accede de forma directa a nuestros beans, sino a través de proxies. No me siento orgulloso de esta implementación, pero funciona:

```java
private String cleanClassName(String proxyClassName) {
    // I dont feel proud for this implementation, but it works
    return proxyClassName.replaceAll("_ClientProxy", "");
}
```

Ahora si, podemos definir nuestro método extractor:

```java
private List<ListenRequest> extractListenRequests() {
    // our initial response
    List<ListenRequest> requests = new ArrayList<>();
    // we iterate the injected listeners
    for (IListener listener : partialListeners) {
        // we extract the original class name from the proxy (Quarkus does not inject the bean directly)
        String listenerProxyClassName = listener.getClass().getName();
        String listenerClassName = cleanClassName(listenerProxyClassName);
        // we load the original class
        Class<?> listenerClass = null;
        try {
            listenerClass = Class.forName(listenerClassName);
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
            LOG.error("Metadata for listener " + listenerClassName + " not found. Skipping...");
            continue;
        }
        // We get the annotation from the original class
        ListenerQualifier annotation = listenerClass.getAnnotation(ListenerQualifier.class);
        // if the annotation has an valid url property we continue
        if (Objects.nonNull(annotation.urlProperty()) && !annotation.urlProperty().equals("")) {
            // we get the url from properties
            String url = ConfigProvider.getConfig().getValue(annotation.urlProperty(), String.class);
            // we build an object containing all the information
            ListenRequest lr = new ListenRequest(listener, url, annotation.parallelProcessing(),
                    annotation.maxNumberOfMessagesPerProcessing(), annotation.minProcessingMilliseconds());
            // we append it to our response
            requests.add(lr);
        }
    }
    return requests;
}
```

Puede parecer complejo, pero nuestro método es bastante básico:

- Defino una lista que enviaré como respuesta cuando termine el método
- Itero los listeners inyectados.
- Extraigo el nombre de la clase de cada listener y la limpio.
- Cargo la clase
- Extraigo la anotación a partir de esta clase.
- Si la anotación tiene una propiedad url válida, extraigo la url de `application.properties`.
- Construyo un objeto ListenRequest y lo lleno con la información obtenida.
- Lo agrego a nuestra lista.
- Una vez las iteraciones terminen, retorno la lista.


Por último, construiremos un método que llamará a nuestro extractor y comenzará el orquestador con la información obtenida en un nuevo hilo para no bloquear el actual. Esto ocurrirá tras instanciarse el bean (lo que ocurre al comienzo de la app de acuerdo con nuestra configuración)

```java
@PostConstruct
public void init() {
    // we just want to launch the listeners if the profile is not test
    if (!ProfileManager.getActiveProfile().equals("test")) {
        LOG.info("Launching listeners");
        // we transform the data so we can handle it in a more readable way
        List<ListenRequest> requests = extractListenRequests();
        // we launch the listening orchestation in a different thread to avoid blocking the main thread
        Executors.newSingleThreadExecutor().submit(() -> orchestrateListeners(requests, null));
    }
}
```

En resumen, ordenamos la extracción de información y mandamos la lista de listeners a nuestro orquestador solamente si el perfil activo no es el de pruebas (no queremos levantar los listeners cuando estemos haciendo nuestras pruebas unitarias).


<details>
<summary>Pruebas unitarias (opcional)</summary>
Primero construiremos nuestra clase de pruebas:

```java
@QuarkusTest
public class ListenerLauncherTest {
    // our service that launches the listeners
    @Inject
    ListenerLauncherService listenerLauncher;

     // our service that communicates with the queue provider
    // we dont want to actually call it so we mock it
    @InjectMock
    QueueConsumerService queueConsumerService;

    // mocks objects based on the IListener interface. As interfaces, we will initialize them later
    IListener oneWayListenerMock;
    IListener twoWaysListenerMock;
}
```

Como pueden observar, inyectamos un mock de nuestro adaptador de colas, inyectamos una instancia del lanzador que acabamos de construir y declaramos dos objectos en los que inicializaremos mocks de los listeners.

Pasemos ahora a configurar los mocks:

```java
@BeforeEach
public void beforeEach() throws MessagePollingException {
    // we initialize our listener mocks
    oneWayListenerMock = Mockito.mock(IListener.class);
    twoWaysListenerMock = Mockito.mock(IListener.class);
    
    // we simulate a response for our listener mocks when the process method is called
    Mockito.when(twoWaysListenerMock.process(Mockito.anyString())).thenReturn(Optional.of("Chao"));
    Mockito.when(oneWayListenerMock.process(Mockito.anyString())).thenReturn(Optional.empty());

    // we will simulate the poll function of our queue consumer provider
    Mockito.when(queueConsumerService.pollMessages(Mockito.anyString(), Mockito.anyInt()))
        .thenAnswer(invocations -> {
            // The messages we will receive will have the following format
            // sourceQueueName + "/responseQueue"
            String responseQueueUrl = invocations.getArgument(0) +"/responseQueue";
            // we create a list of messages that our mock will return
            return List.of(
                new QueueMessage("Hola", "ES_00000001", new HashMap<String, String>() {{
                    put("Signature", "ES");
                    put("ResponseQueueUrl", responseQueueUrl);
                }}),
                new QueueMessage("Hi", "EN_00000001", new HashMap<String, String>() {{
                    put("Signature", "EN");
                    put("ResponseQueueUrl", responseQueueUrl);
                }}),
                new QueueMessage("Ciao", "IT_00000001", new HashMap<String, String>() {{
                    put("Signature", "IT");
                    put("ResponseQueueUrl", responseQueueUrl);
                }})
            );
    });
}
```

Inicializamos nuestros mocks, configuramos la respuesta para cuando el método process sea llamado en cada uno (el mock bidireccional retorna una respuesta, mientras que el unidireccional no) y configuramos el mock del bean que se comunica con el proveedor (como nota para facilitar los tests, el nombre de la cola de origen de los mensajes es la cola de destino más "/responseQueue").

Ahora sí pasamos a las pruebas:

```java
@Test
public void testTwoWaysListening() throws MessageSendingException, MessagePollingException{
    // define listen request
    ListenRequest listenRequest = new ListenRequest(twoWaysListenerMock,  "FirstMock", false, 10, 0);
    // we will launch polling three times
    Integer numberOfRequests = 3;

    // we launch the orchestration
    listenerLauncher.orchestrateListeners( List.of(listenRequest), numberOfRequests);

    // in three pollings we expect three calls to our provider
    Mockito.verify(queueConsumerService, Mockito.times(3)).pollMessages("FirstMock", 10);
    // we verify that the processer and sender has been called three times as well
    Mockito.verify(queueConsumerService, Mockito.times(3)).sendAnswer(Mockito.eq("FirstMock/responseQueue"), Mockito.eq("Chao"), Mockito.eq("ES"));
}
```

En este test verificamos que al ordenar tres pollings a nuestro orquestador, efectivamente se realice ese número con los datos deseados.

```java
@Test
public void testOneWayListening() throws MessageSendingException, MessagePollingException{
    //define listen request
    ListenRequest listenRequest = new ListenRequest(oneWayListenerMock,  "SecondMock", false, 10, 0);
    Integer numberOfRequests = 3;

    listenerLauncher.orchestrateListeners( List.of(listenRequest), numberOfRequests);
    
    // in those three pollings we expect three calls to our provider
    Mockito.verify(queueConsumerService, Mockito.atLeast(3)).pollMessages("SecondMock", 10);
    // as those messages do not expect response, we verify that the send answer method has not been called
    Mockito.verify(queueConsumerService, Mockito.never()).sendAnswer(Mockito.eq("SecondMock/responseQueue"), Mockito.any(), Mockito.anyString());
}
```

Este test es se dirige a las llamadas unidireccionales. Verifiquemos que se llame tres veces al polling pero también nos aseguramos que efectivamente no se envíe una respuesta cuando se procesen estos mensajes.

```java
@Test
public void testNoParallelProcessing() throws InterruptedException, ExecutionException, MessageSendingException {
    //we define the listener request with non parallel processing
    ListenRequest listenRequest = new ListenRequest(twoWaysListenerMock,  "ThirdMock", false, 10, 500);
    // we just require 1 polling to test this behaviour
    Integer numberOfRequests = 1;

    // we will call this listener asyncronously because we want to check the calls at an specifiy point of time during its execution
    Future<?> task = CompletableFuture.runAsync(() -> {
        listenerLauncher.orchestrateListeners(List.of(listenRequest), numberOfRequests);
    });
    Thread.sleep(500); // 500 ms for the processing of one message
    // there should be just one message processed as messages are processed in a sequence
    Mockito.verify(queueConsumerService, Mockito.times(1)).sendAnswer(Mockito.eq("ThirdMock/responseQueue"), Mockito.anyString(), argThat(arg-> arg.equals("ES") || arg.equals("EN") || arg.equals("IT")));
    // we wait the task to finish
    task.get();
}
```

En este test probamos el procesamiento secuencial. Lanzamos nuestro mock especificando que deseamos un procesamiento mínimo de mensaje de 500 ms. Por ello, si cada procesamiento 500 ms y el procesamiento se configuró de forma secuencial, en 500 ms solamente debe haberse procesado un mensaje.

```java
@Test
public void testParallelProcessing() throws InterruptedException, ExecutionException, MessageSendingException {
    // we define the listener request with parallel processing
    ListenRequest listenRequest = new ListenRequest(twoWaysListenerMock,  "FourthMock", true, 10, 500);
    Integer numberOfRequests = 1;
    // we call the listener async because we want to check the calls at an specifict point of time
    Future<?> task = CompletableFuture.runAsync(() -> {
        listenerLauncher.orchestrateListeners(List.of(listenRequest), numberOfRequests);
    });
    Thread.sleep(500);  
    // as process are processed in parallel, we expect more that one message processed during those 500 ms
    Mockito.verify(queueConsumerService, Mockito.atLeast(2)).sendAnswer(Mockito.eq("FourthMock/responseQueue"), Mockito.anyString(), argThat(arg-> arg.equals("ES") || arg.equals("EN") || arg.equals("IT")));
    // we wait the task to finish
    task.get();
} 

```

A continuación, en las mismas circunstancias del test anterior, pero ahora con un procesamiento paralelo, en un medio segundo se debe haber procesado más de un mensaje.

```java
@Test
public void testMultipleListeners() throws MessageSendingException, MessagePollingException {
        // define multiple listen requests
        ListenRequest listenRequest = new ListenRequest(twoWaysListenerMock,  "FifthMock", false, 10, 0);
        ListenRequest secondRequest = new ListenRequest(twoWaysListenerMock,  "SixthMock", false, 10, 0);
        Integer numberOfRequests = 3;

        // we launch the orchestration
        listenerLauncher.orchestrateListeners( List.of(listenRequest, secondRequest), numberOfRequests);

        // in three polling requests we expect three calls for each listener
        Mockito.verify(queueConsumerService, Mockito.times(3)).pollMessages("FifthMock", 10);
        Mockito.verify(queueConsumerService, Mockito.times(3)).pollMessages("SixthMock", 10);
        // we verify that the processer and sender has been called three times
        Mockito.verify(queueConsumerService, Mockito.times(3)).sendAnswer(Mockito.eq("FifthMock/responseQueue"), Mockito.eq("Chao"), Mockito.eq("ES"));
        Mockito.verify(queueConsumerService, Mockito.times(3)).sendAnswer(Mockito.eq("SixthMock/responseQueue"), Mockito.eq("Chao"), Mockito.eq("ES"));
}
```

Por último, verificamos que si a nuestro orquestador le envíamos más de un listener, que haga los pollings respectivos y el envío de respuesta si es que aplica.

</details>


¡Al fin! Hemos terminado la arquitectura para al comunicación. Aunque fue bastante arduo, a continuación veremos que levantar nuestros listeners será muy fácil.

### Levantamiento de los listeners

Primero definamos un pequeño repositorio que tendrá unos datos precargados y permitirá subir nuevos datos:

```java
@ApplicationScoped
public class CoordinatesRepository {
    private Map<String, List<Double>> coordinates = new HashMap<>() {{
        put("Santiago", List.of(-33.447487, -70.673676));
        put("Coquimbo", List.of(-30.657041, -71.8844573));
    }};

    public List<Double> getCoordinates(String city) {
        return coordinates.get(city);
    }

    public void addCoordinates(String city, double lat, double lon) {
        coordinates.put(city, List.of(lat, lon));
    }
}
```

Ahora construiremos un servicio básico que se comunique con el repositorio:

```java
@ApplicationScoped
public class CoordinatesService {
    @Inject
    CoordinatesRepository repository;
    
    public List<Double> getCoordinates(String city) {
        return repository.getCoordinates(city);
    }
    
    public void addCoordinates(String city, double lat, double lon) {
        repository.addCoordinates(city, lat, lon);
    }
}

```

<details>
<summary> Pruebas unitarias (opcional) </summary>
Definamos algunas pruebas unitarias básicas para probar lo siguiente:

- Consulta exitosa
- Consulta sin resultados
- Inserción de coordenadas exitosa

Aquí nuestras pruebas

```java
@QuarkusTest
public class CoordinatesServiceTest {
    
    @Inject
    CoordinatesService service;

    @Test
    public void testGetCoordinates() {
        List<Double> coordinates = service.getCoordinates("Santiago");
        Assertions.assertNotNull(coordinates);
        Assertions.assertEquals(-33.447487, coordinates.get(0));
        Assertions.assertEquals(-70.673676, coordinates.get(1));
    }

    @Test
    public void testNotFoundCoordinates() {
        List<Double> coordinates = service.getCoordinates("NotFound");
        Assertions.assertNull(coordinates);
    }

    @Test
    public void testCoordinatesInsertion() {
        service.addCoordinates("Punta Arenas", -53.7873884,-53.7873884);
        List<Double> coordinates = service.getCoordinates("Punta Arenas");
        Assertions.assertNotNull(coordinates);
        Assertions.assertEquals(-53.7873884, coordinates.get(0));
        Assertions.assertEquals(-53.7873884, coordinates.get(1));
    }
}
```
</details>

Perfecto, ahora creemos un listener que escuchará a la cola bidireccional en para hacer consultar y retornar el resultado.

```java
@ApplicationScoped
@RegisterForReflection
@ListenerQualifier(urlProperty = "twoways.queue.url", parallelProcessing = false, minProcessingMilliseconds = 20)
public class CoordinateQueryListener  implements IListener {

    @Inject
    CoordinatesService service;
    
    // listener for two ways comunication
    public Optional<String> process(String message){
        try {
            // convert the original message to json
            JsonObject requestBody = new JsonObject(message);
            // extract the city name to be searched
            String city = requestBody.getString("city");
            // we make the query
            List<Double> coordinates = service.getCoordinates(city);
            // we start building the response
            JsonObject json = new JsonObject();
            if(Objects.nonNull(coordinates)) {
                // coordinates found
                json.put("name", city);
                json.put("lat", coordinates.get(0));
                json.put("lon", coordinates.get(1));
                json.put("status", "OK");
            } else {
                // coordinates not found
                json.put("status", "NO_RESULTS");
            }
            return Optional.of(json.encode());
        } catch(Exception e) {
            // any error
            e.printStackTrace();
            JsonObject json = new JsonObject(); 
            json.put("status", "INTERNAL_SERVER_ERROR" );
            return Optional.of(json.encode());
        }
    }
}
```

Y ese es nuestro listener. Como pueden observar no es nada complejo, sino que nos dedicamos solamente a comunicar nuestra lógica de negocios. Cabe destacar los siguientes puntos:

- Se requiere ApplicationScoped para hacerlo un bean inyectable compartido entre otras clases que lo utilicen.
- Asimismo, se requiere RegisterForReflection para poder obtener los metadatos de la cola.
- ListenerQualifier es nuestra anotación, en la cual definimos los metadatos para el procesamiento de los mensajes de nuestra cola. El único campo obligatorio es la propiedad url de nuestra cola.
- Nuestro listener implementqa los métodos de IListener.
- En este caso especifico deshabilitamos el procesamiento paralelo y pedimos un procesamiento mínimo de 20 ms y así no hacer más de 50 consultas por segundo (esa fue nuestra premisa inicial).
- Inyectamos nuestro servicio de coordenadas.
- El método process en este caso extrae la busqueda del mensaje recibido, lo busca en nuestro servicio y envía una respuesta acorde a los resultados obtenidos.

Pasemos ahora al segundo listener: la cola que recibe mensajes que no esperan una respuesta.

```java
@ApplicationScoped
@RegisterForReflection
@ListenerQualifier(urlProperty = "oneway.queue.url")
public class CoordinateSubmissionListener implements IListener {

    @Inject
    CoordinatesService service;

    // listener for one way communication
    public Optional<String> process(String message) {
        JsonObject requestBody = new JsonObject(message);
        String city = requestBody.getString("name");
        Double lat = requestBody.getDouble("lat");
        Double lon = requestBody.getDouble("lon");
        service.addCoordinates(city, lat, lon);
        return Optional.empty();
    }
}
```


Como pueden observar, la implementación de este listener fue más simple aún. El método procesador solo se encarga de insertar los resultados que obtiene del mensaje y luego "retorna" un opcional vacío. Como recordamos, nuestro procesador interpretará esto como que no debe retornar una prueba.

Al fin, hemos terminado ambos servicios. 

<details>
<summary> Pruebas de integración (opcional)</summary>

Primero, vamos a generar una imagen Docker de nuestro servicio consumidor. Nos aseguramos de tener instalada la librería encargada.

```bash
quarkus extension add 'container-image-docker'
```

Una vez asegurados de eso construimos la imagen:

```bash
quarkus build -Dquarkus.container-image.build=true
```

Este generará una imagen Docker y la registrará en nuestro repositorio local. Ahora pudiesemos subir esta imagen a ECR pero para mantener las cosas simples seguiremos con nuestro repositorio local. Solo debemos tomar en cuenta el nombre de la imagen creada y la versión (en mi caso `leonelsanchez/sqs-quarkus-consumer:1.0.0-SNAPSHOT`).

Volvamos a nuestro servicio productor de mensajes. Primero definiremos una clase de pruebas:

```java
@QuarkusTest
@TestProfile(CoordinatesResourceIT.TestProfile.class)
public class CoordinatesResourceIT {
    // ..
}
```
Como podemos ver, adjuntamos un perfil de pruebas. Este contendrá la configuración enlazada a los contenedores que levantaremos.

Ahora definamos la configuración para nuestro primer contenedor: Localstack.

```java
@Container
public static GenericContainer<?> localstack = new GenericContainer<>(
        DockerImageName.parse("localstack/localstack:0.11.1"))
        .withEnv(new HashMap<String, String>() {
            {
                put("SERVICES", "sqs");
                put("START_WEB", "0");
                put("DEFAULT_REGION", "us-east-1");
            }
        })
        .withExposedPorts(4566).waitingFor(
                Wait.forLogMessage(".*Ready.*\\n", 1))
        .withStartupTimeout(Duration.ofSeconds(180));
```

Como podemos observar, levantamos el contenedor localstack con la región por defecto de us-east-1 y solamente el servicio sqs. Exponemos el puerto 4566 y esperamos que el contenedor esté listo.

Ahora definamos la configuración para nuestro segundo contenedor: el consumidor.

```java
public static GenericContainer<?> consumerContainer = new GenericContainer<>(
    DockerImageName.parse("leonelsanchez/sqs-quarkus-consumer:1.0.0-SNAPSHOT"))
    .withExposedPorts(8080).waitingFor(
            Wait.forLogMessage(".*Listening on.*\\n", 1))
    .withStartupTimeout(Duration.ofSeconds(180));
```

Como ven aún no le definimos los enlaces a nuestro contenedor localstack, pues todavía no los obtenemos. Acá solamente nos preocupamos de declarar qué imagen queremos levantar y en que puerto y cómo saber que está listo.

Definamos ahora nuestro perfil de pruebas, que se encargará de orquestar el levantamiento de los contenedores que acabamos de declarar.

```java
public static class TestProfile implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
        // localstack configuration
        Network network = Network.newNetwork();
        localstack.withNetwork(network);
        localstack.withNetworkAliases("localstack");
        localstack.start();
        try {
            localstack.execInContainer("awslocal", "sqs", "create-queue", "--queue-name", "OneWayQueue");
            localstack.execInContainer("awslocal", "sqs", "create-queue", "--queue-name", "TwoWaysQueue");
        } catch (Exception e) {
            e.printStackTrace();
        }
        String localstackInternalUrl = "http://localstack:4566";
        // consumer configuration
        consumerContainer.withEnv("twoways.queue.url", localstackInternalUrl + "/queue/TwoWaysQueue");
        consumerContainer.withEnv("oneway.queue.url", localstackInternalUrl + "/queue/OneWayQueue");
        consumerContainer.withEnv("quarkus.sqs.endpoint-override", localstackInternalUrl);
        consumerContainer.withNetwork(network);
        consumerContainer.start();
        // producer configuration
        String localstackUrl = "http://" + localstack.getHost() + ":" + localstack.getFirstMappedPort();
        return new HashMap<String, String>() {
            {
                put("twoways.queue.url", localstackUrl + "/queue/TwoWaysQueue");
                put("oneway.queue.url", localstackUrl + "/queue/OneWayQueue");
                put("queue.provider", "sqs");
                put("quarkus.sqs.endpoint-override", localstackUrl);
                put("quarkus.sqs.aws.region", "us-east-1");
                put("quarkus.sqs.aws.credentials.type", "static");
                put("quarkus.sqs.aws.credentials.static-provider.access-key-id", "AAEEII");
                put("quarkus.sqs.aws.credentials.static-provider.secret-access-key", "AAEEII");
            }
        };

    }
}
```

Detallemos lo que acabamos de hacer.
- Defino una red común para que nuestros contenedores puedan comunicarse entre ellos.
- Defino un alias de red para mi contenedor localstack.
- Lanzo el contenedor localstack.
- Creo una cola unidireccional y otra bidireccional.
- Obtengo el enlace interno (es decir entre contenedores) de mi contenedor localstack
- Inyecto este enlace en las variables de entorno para lanzar mi contenedor consumidor.
- Vinculo este nuevo contenedor a la red previamente creada.
- Obtengo la url expuesta del contenedor localstack.
- Inyecto la url a la configuración del proyecto actual.

Ahora sí. Primero definamos una prueba básica para nuestro endpoint de consulta:

```java
@Test
public void testQueryEndpoint() {
    String rawMessage = given()
            .when().get("/coordinates/search/{query}", "Santiago")
            .then()
            .statusCode(200)
            .extract()
            .asString();
    JsonObject messageReceived = new JsonObject(rawMessage);
    Assertions.assertNotNull(messageReceived.getDouble("lat"));
    Assertions.assertNotNull(messageReceived.getDouble("lon"));
}
```

En otras palabras, verificamos que obtengamos efectivamente una respuesta con valores no nulos.

Ahora verifiquemos que cuando ingreso una busqueda inválida no me traiga ningún resultado.

```java
@Test
public void testQueryEndpointNotFound() {
    String rawMessage = given()
            .when().get("/coordinates/search/{query}", "Chuchuncocity")
            .then()
            .statusCode(200)
            .extract()
            .asString();
    JsonObject messageReceived = new JsonObject(rawMessage);
    Assertions.assertNull(messageReceived.getDouble("lat"));
    Assertions.assertNull(messageReceived.getDouble("lon"));
    Assertions.assertEquals("NO_RESULTS", messageReceived.getString("status"));
}
```


Por último, verifiquemos nuestro endpoint unidireccional de publicación insertando una coordenada y verificando más tarde su existencia:

```java
 @Test
public void testSubmitEndpoint() throws InterruptedException {
    // we send a request to submit coordinates of a new city
    JsonObject body = new JsonObject();
    body.put("name", "Portsmouth");
    body.put("lat", 50.8047148);
    body.put("lon", -1.1667698);

    given()
            .when()
            .contentType(MediaType.APPLICATION_JSON)
            .body(body.encode())
            .post("/coordinates/submit")
            .then()
            .statusCode(200);

    // we wait for a reasonable time
    Thread.sleep(5000);

    // we check if the city was inserted
    String rawMessage = given()
            .when().get("/coordinates/search/{query}", "Portsmouth")
            .then()
            .statusCode(200)
            .extract()
            .asString();
    JsonObject messageReceived = new JsonObject(rawMessage);
    Assertions.assertNotNull(messageReceived.getDouble("lat"));
    Assertions.assertNotNull(messageReceived.getDouble("lon"));
}
```

Como vemos, como es un endpoint asíncrono, no esperamos respuesta sino solamente confirmamos que el mensaje fue enviado correctamente al consultar por las coordenadas creadas.

</details>

# Conclusión

Sé que este tutorial fue bastante largo. No obstante, podrán advertir que una vez implementada la arquitectura, implementar nuevos métodos que envían mensajes esperando una respuesta o la adición de nuevos listeners es rápidamente implementable (por nuestras interfaces en el cliente o por nuestras anotaciones en el consumidor). Asimismo, con nuestro sistema de firmas, nos aseguramos de recibir como respuesta el mensaje que deseamos y no un mensaje duplicado de otra petición. Por último, con nuestra pseudo implementación de cola virtual, nos aseguramos de no tener que crear colas por cada petición, sino reutilizar una exclusiva de la instancia servicio, lo que reduce significativamente los costos de AWS.

SQS se ha transformado en uno de mis servicios favoritos de AWS. Espero que con este humilde tutorial fomente el uso de colas por los enormes beneficios que puede traer, tanto unidireccional como bidireccionalmente.

