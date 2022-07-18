---
title: "Serialización y deserialización de objetos de terceros para caching con Quarkus y Jackson"
imageUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-jackson-third-party-objects-serialization-for-caching/cover.jpg"
thumbnailUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-jackson-third-party-objects-serialization-for-caching/thumbnail.jpg"
imageAuthorName: Sigmund
imageAuthorUrl: https://unsplash.com/@sigmund?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/blueprints?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022/07/18 11:37:00'
readingTime: 10
excerpt: "¿Será posible almacenar en un sistema de caché distribuido objetos de terceros y de los cuales no puedo modificar su estructura para hacerlos serializables y deserializables?"
author: "Leonel Sánchez"
tags: 
    - "Java"
    - "Quarkus"
    - "Jackson"
    - "Serialización"
    - "Deserialización"
---

En el pasado artículo implementamos un sistema de caché distribuido en Quarkus en base a Redis. En términos sencillos, solo teníamos que colocar una anotación a un método al que queríamos hacer caching de sus respuestas y los interceptores hacían el resto. Pero como Redis no soporta almacenar un objeto Java as-is, era necesario serializarlo. Y como también necesitabamos retornarlo, asimismo era necesario poder deserializarlo.

No obstante, el caching del siguiente método fallaría:

```java
 @GET
@Produces(MediaType.APPLICATION_JSON)
@Cached(cacheName = "cache-list-stock-request")
public Response getAll () throws Exception {
    // ...
}
```

¿Por qué? Debido a que la clase Response de JAX-RS, si bien es serializable, no es posible deserializarla. Debido a que la utilización de Response para el envío de respuestas de endpoints es muy común, ¿como podemos hacer caching de objetos de terceros que no son serializables o deserializables?

Jackson (la librería que utilizamos para realizar la serialización y deserialización de objetos), permite crear serializadores y deserializadores personalizados, lo que nos permite definir cómo deseamos que un objeto pase a JSON y cómo utilizamos este JSON para construir de vuelta el mismo objeto. Con esta funcionalidad, podremos facilmente realizar caching de objetos a los cuales no podemos modificar su estructura.

Para probar el caching del objeto Response, extenderemos el proyecto del artículo pasado y ahora implementaremos un endpoint para traer todos los productos y su stock. El endpoint retornará la entidad con el wrapper de Response y se almacenará en caché.

Todo el código está disponible en el [siguiente repositorio](https://github.com/starxmaker/quarkus-redis-distributed-cache)

## Recordatorio

En el anterior artículo configuramos lo siguiente:

```java
@ApplicationScoped
public class CachedService {

    //...

    ObjectMapper objectMapper;

    public CachedService(){
        objectMapper = new ObjectMapper();
        // enable default typing
        // NOTE: never enable this configuration (Basetype: Object) to deserialize json data from external sources,
        // because someone could send a json string with an exploitable type which could lead to remote
        // code execution. We are enabling it because we will deserialize only json data serialized by us and it is not
        // accesible for external sources.
        PolymorphicTypeValidator ptv = BasicPolymorphicTypeValidator
            .builder()
            .allowIfBaseType(Object.class)
            .build();
        objectMapper.activateDefaultTyping(ptv, ObjectMapper.DefaultTyping.EVERYTHING);
    }

    //...

}
```

En el proyecto creamos un `objectMapper` específico y le habilitamos el `defaultTyping` para cualquier tipo de objeto. Esto nos facilita enormemente el trabajo, pues delega la responsabilidad para el manejo de tipos complejos o con campos de tipado dinámicos (como es el caso del campo `entity` de la clase Response). No obstante, como se mencionó en el artículo anterior, hay que tener mucho cuidado con esta configuración y jamás permitir que el mapeador lea payloads externos que especifiquen el tipo como metadata, pues hace a nuestra aplicación vulnerable a la ejecución de código remoto. En este caso, cabe recordar que nosotros sólo lo habilitamos pues, para nuestro caso de uso particular de `caching`, los payloads son de proveniencia interna, fueron generados por nosotros mismos y nadie externo debería poder modificarlos. Por ello si se implementa esta característica, debe analizarse seriamente la seguridad del almacenamiento del payload y de cómo operamos con él.

## Configuración del serializador

Si bien podremos comprobar que si serializamos un objeto Response a través de Jackson obtendremos respuesta, a opinión personal, si construiremos un deserializador personalizado en base a una serialización en partícular, un cambio en la última provocaría errores en la aplicación. Por ello, implementar un serializador personalizado nos permitirá tener mayor control del proceso y limitar posibles factores externos.

Entonces, creamos una clase llamada `ResponseSerializer` y le definimos la siguiente estructura:

```java
public class ResponseSerializer extends StdSerializer<Response> {

    public ResponseSerializer() {
        super(Response.class);
    }

    @Override
    public void serialize(Response value, JsonGenerator gen, SerializerProvider provider)
      throws IOException {
        // ...
    }

    @Override
    public void serializeWithType(Response value, JsonGenerator gen, SerializerProvider provider,
      TypeSerializer typeSer) throws IOException {
        // ...
    }
}
```

Como podemos observar en el extracto, aquí definimos que nuestro serializador extienda la funcionalidad de un serializador de Jackson e indicamos el tipo que nuestro serializador manejará. Asimimo, debemos sobrescribir dos métodos principalmente: `serialize` para el paso del objeto en sí a JSON y `serializeWithType` que se encarga de indicar el tipo del objeto contenido en el payload (recuerden que habilitamos el `defaultTyping` para Jackson), además de abrir y cerrar el objeto.

Partamos con el método `serialize`, que se encargará de extraer los campos del objeto y escribirlos en el JSON. Para mantener la simplicidad, solamente extraeremos dos campos: `status` y `entity`.  Esto debido a que un objeto Response puede tener tantos campos diferentes que extenderían este artículo demasiado. Por ello recomiendo ir definiendo los campos que se serializarán dependiendo de los requerimientos de la aplicación en partícular. En efecto, la implementación de otros campos (tales como cabeceras o cookies) no debería tener mayor dificultad, aunque en el caso de las cookies, se requiere también definir un serializador y deserializador para el objeto NewCookie de JAX-RS.

```java
@Override
public void serialize(Response value, JsonGenerator gen, SerializerProvider provider)
    throws IOException {
    // we write the status on the status field
    gen.writeNumberField("status", value.getStatus());
    // we call the serializer provider to delegate the responsability of serializing the internal entity
    provider.defaultSerializeField("entity", value.getEntity(), gen);
}
```
Como podemos observar, extraemos directamente la propiedad `status` de nuestro objeto Response y la escribimos en un campo del mismo nombre. No obstante, en el caso de `entity`, como no sabemos cuál es el tipo del objeto, delegamos la responsabilidad de serializarlo al `SerializerProvider` y así además se indicará en la metadata el tipo del objeto en sí y los de sus propiedades hijos.

Perfecto, ahora sobrescribamos el método `serializeWithType`. En teoría lo que debo realizar es indicar el tipo relacionado al objeto serializado, abrir el objeto, orquestar la serialización que anteriormente construimos y cerrar el objeto.

```java
@Override
public void serializeWithType(Response value, JsonGenerator gen, SerializerProvider provider,
    TypeSerializer typeSer) throws IOException {
    // We explicitly identify the type of the serialized object because Response is an abstract class
    // and the object received will be a specific implementation of it.
    WritableTypeId typeId;
    try {
        typeId = typeSer.typeId(value, Class.forName("javax.ws.rs.core.Response"), JsonToken.START_OBJECT);
    } catch (ClassNotFoundException e) {
        throw new RuntimeException(e);
    }
    // we open the object
    typeSer.writeTypePrefix(gen, typeId);
    // we call the serialize method
    serialize(value, gen, provider);
    // we close the object
    typeSer.writeTypeSuffix(gen, typeId);
}
```

Nótese que no obtenemos el tipo de la respuesta, sino que se lo indicamos explicitamente. ¿Por qué?, debido a que Response es una clase abstracta y el objeto que le pasemos será de una clase que la implemente, por lo que el tipo que genere no sería exactamente Response. Esto nos causaría problemas cuando implementemos el deserializador personalizado de Response, porque la aplicación no sabría que tendría que llamarlo, sino que intentaría llamar al deserializador de la clase concreta.

Perfecto, hemos concluido nuestro serializador. Ahora, para registrarlo, basta con ir a nuestro servicio de Cache (o donde sea que hayamos declarado nuestro `objectMapper`) y añadimos el siguiente código después de inicializar el mapper:

```java
SimpleModule module = new SimpleModule();
module.addSerializer(Response.class, new ResponseSerializer());
objectMapper.registerModule(module);
```

<details>
<summary>Pruebas unitarias (opcional) </summary>
Para verificar que nuestro serializador funcione correctamente, primero definiremos una suite de pruebas.

```java
@QuarkusTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class ResponseSerializationTest {
    ObjectMapper mapper = new ObjectMapper();
    // ...
}
```

Como vemos, definimos una suite de pruebas y creamos un `objectMapper` propio para la clase. Fíjense que hemos agregado la anotación `@TestInstance(TestInstance.Lifecycle.PER_CLASS)`. Esto nos permite agregar un método que se ejecutará antes de todas las clases, sin la necesidad de que este último sea estático.

Ahora implementaremos ese método inicial que registrará el serializador al mapper y activará el `defaultTyping`:

```java
@BeforeAll
public void beforeAll() {
    SimpleModule module = new SimpleModule();
    module.addSerializer(Response.class, new ResponseSerializer());
    mapper.registerModule(module);
    PolymorphicTypeValidator ptv = BasicPolymorphicTypeValidator
    .builder()
    .allowIfBaseType(Object.class)
    .build();
    mapper.activateDefaultTyping(ptv, ObjectMapper.DefaultTyping.EVERYTHING);
}
```

Pasemos a la primera prueba, en la que comprobaremos que una respuesta simple (con statusCode, sin entidad) se serialice de forma correcta. Para ello, generaremos el JSON y luego lo procesaremos con la clase `JsonArray` para verificar que el contenido como la metadata del objeto raíz sean exactos:

```java
@Test
public void testBasicResponseSerialization() throws Exception {
    Response response = Response.status(200).build();
    String className = "javax.ws.rs.core.Response";
    String json = mapper.writeValueAsString(response);
    JsonArray jsonArray = new JsonArray(json);
    Assertions.assertEquals(className, jsonArray.getString(0));
    Assertions.assertEquals(200, jsonArray.getJsonObject(1).getInteger("status"));
}
```

Ahora realizaremos una prueba para una respuesta con una entidad primitiva. Esto porque no genera una estructura compleja que requiera una apertura y cierre con llaves ni tampoco requiere especificar un tipo debido a que puede inferirse. Verificamos que la entidad enviada esté serializada en el JSON.

```java
@Test
public void testPrimitiveEntitySerialization() throws Exception {
    Response response = Response.status(200).entity("Hello World").build();
    String json = mapper.writeValueAsString(response);
    JsonArray jsonArray = new JsonArray(json);
    Assertions.assertEquals("Hello World", jsonArray.getJsonObject(1).getString("entity"));
}
```

Ahora, por último, probaremos una respuesta con una entidad no primitiva. Esto debe generar una estructura que se abre y cierra con llaves, y la metadata del tipo. Por ello, generaremos el JSON, lo parsearemos, extraeremos la entidad interna y verificaremos tipado y contenido:

```java
@Test
public void testNonPrimitiveEntitySerialization() throws Exception {
    StockResponse entity = new StockResponse("product1",10);
    Response response = Response.status(200).entity(entity).build();
    String json = mapper.writeValueAsString(response);
    JsonArray jsonArray = new JsonArray(json);
    JsonArray entityArray = jsonArray.getJsonObject(1).getJsonArray("entity");
    JsonObject entityJson = entityArray.getJsonObject(1);
    Assertions.assertEquals(entity.getClass().getName(), entityArray.getString(0));
    Assertions.assertEquals(entity.getProduct(), entityJson.getString("product"));
    Assertions.assertEquals(entity.getAvailableStock(), entityJson.getInteger("availableStock"));
}
```
</details>

Perfecto, hemos terminado nuestro serializador. Pasemos al deserializador.

## Configuración del deserializador

Similar al caso de serializador, construiremos una clase llamada `ResponseDeserializer`, la extendemos del deserializador de Jackson e indicamos el tipo que manejará:

```java
public class ResponseDeserializer extends StdDeserializer<Response> { 

    public ResponseDeserializer() { 
        this(null); 
    } 

    public ResponseDeserializer(Class<?> vc) { 
        super(vc); 
    }

    @Override
    public Response deserialize(JsonParser jp, DeserializationContext ctxt) 
      throws IOException, JsonProcessingException {
          //..
      }
}
```

Podemos ver que tenemos que sobrescribir un método de deserialización. Aquí definiremos cómo extraeremos la información del JSON y cómo construiremos un objeto Response con él.

Primero pasemos a la extracción de datos. Aquí no tenemos acceso directo al JSON, sino a un objeto que contiene la estructura descifrada para ser iterada. Cuando el `defaultTyping` está desactivado, basta con solo transformar los datos a un arbol JSON y extraer el contenido. No obstante, cuando está activado, al parecer la transformación a arbol falla cuando desea interpretar los tokens de este objeto. Por ello, como workaround, iteraremos los tokens del objeto, extraeremos la información y la colocaremos en un mapa propio.

```java
// we define a map where we will store the values of the JSON object
Map<String, Object> map = new HashMap<>();
// we analize each token of the object until we reach the end object token
while(!jp.getCurrentToken().equals(JsonToken.END_OBJECT)) {
    // if the current token is the start of the object, there is nothing to read, so we continue 
    if (jp.getCurrentToken() == JsonToken.START_OBJECT) {
        jp.nextToken();
    }
    // if the current token is a field name, we read this key, and the we read the value
    if (jp.currentToken() == JsonToken.FIELD_NAME) {
        // we extract the key
        String fieldName = jp.currentName();
        // we move to the following token
        jp.nextToken();
        // we extract the value as object (we delegate the parsing to Jackson)
        Object value = jp.readValueAs(Object.class);
        // we put the retrieved data to our map
        map.put(fieldName, value);
    }
    // we move to the next token
    jp.nextToken();
}
```

Fíjense que iteramos los tokens del objeto hasta que llegamos a su cierre. Cuando detectamos un campo, extraemos la llave y luego pasamos al siguiente token para extraer el valor. Este último lo leemos como tipo Objeto, para que Jackson transforme de acuerdo al tipo indicado en la metadata o por inferencia en caso de ser primitivo.

Una vez obtenidos los datos, vamos construyendo la respuesta con su `builder`. Partimos con el status, que es un campo obligatorio y luego nos movemos a la entidad, que es opcional:

```java
 // we built our response from the map
// status - compulsory
Integer status = (Integer) map.get("status");
ResponseBuilder responseBuilder = Response.status(status);
// entity - optional
if (map.containsKey("entity") && Objects.nonNull(map.get("entity"))) {
    Object entity = map.get("entity");
    responseBuilder.entity(entity);
}
// we build the response and send it back
return responseBuilder.build();
```

Finalmente retornamos el objeto creado.

Genial. Hemos finalizado nuestro deserializador. Ahora solo basta ir donde definimos nuestro mapper y registrarlo:

```java
module.addDeserializer(Response.class, new ResponseDeserializer());
```

<details>
<summary>Pruebas unitarias (opcional)</summary>

Reutilizaremos la suite de pruebas de la serialización. Por ello, debemos registrar nuestro deserializador en el método que se ejecuta antes de todas las pruebas.

```java
module.addDeserializer(Response.class, new ResponseDeserializer());
```

Partiremos realizando una prueba de respuesta simple sin entidad. La definiremos, la serializaremos, la deserializaremos y compararemos sus valores:

```java
@Test
public void testBasicResponseDeserialization() throws Exception {
    Response response = Response.status(400).build();
    String json = mapper.writeValueAsString(response);
    Response deserializedResponse = (Response) mapper.readValue(json, Object.class);
    Assertions.assertEquals(400, deserializedResponse.getStatus());
}
```

Haremos lo mismo con una respuesta de entidad primitiva:

```java
@Test
public void testPrivimiteEntityResponseDeserialization() throws Exception {
    String entity = "Hello World";
    Response response = Response.status(400).entity(entity).build();
    String json = mapper.writeValueAsString(response);
    Response deserializedResponse = (Response) mapper.readValue(json, Object.class);
    Assertions.assertEquals(400, deserializedResponse.getStatus());
    Assertions.assertEquals(entity, deserializedResponse.getEntity());
}
```

Por último, haremos lo mismo con una respuesta de entidad no primitiva, extraeremos el objeto y compararemos sus propiedades con la entidad original:

```java
@Test
public void testNonPrimitiveEntityResponseDeserialization() throws Exception {
    StockResponse entity = new StockResponse("product1",10);
    Response response = Response.status(400).entity(entity).build();
    String json = mapper.writeValueAsString(response);
    Response deserializedResponse = (Response) mapper.readValue(json, Object.class);
    Assertions.assertEquals(400, deserializedResponse.getStatus());
    StockResponse deserializedEntity = (StockResponse) deserializedResponse.getEntity();
    Assertions.assertEquals(entity.getProduct(), deserializedEntity.getProduct());
    Assertions.assertEquals(entity.getAvailableStock(), deserializedEntity.getAvailableStock());
    Assertions.assertEquals(entity.getLastUpdate(), deserializedEntity.getLastUpdate());
}
```
</details>

Perfecto. hemos terminado nuestro serializador y deserializador. 

## Nota para modo nativo

Tal como en el artículo anterior, si deseamos compilar en nativo, necesitamos registrar para reflection las clases de terceros que utilicemos como tipado, para que no se descarten en la compilación y que así Jackson pueda deserializar correctamente. Asi que en la misma clase vacía del artículo anterior, ahora agregamos la clase Response:

```java
@RegisterForReflection(targets = {Response.class, Date.class})
public class MyReflectionConfiguration {
    
}
```

## Ejemplo

Ahora implementaremos un endpoint que traerá todos los artículos y sus stocks. Para ello, añadiremos el siguiente código en nuestro `StockRepository`:

```java
public Map<String,Integer> getAllStock() throws Exception {
    Thread.sleep(3000);
    return stocks;
}
```

Siendo `stocks` el mapa que contenía las cantidades por nombre de producto. Como ven simulamos un tiempo de espera de 3 segundos.

Ahora en nuestro `StockService` llamaremos a nuestro repositorio y construiremos una lista con las entidades que enviaremos como respuesta:

```java
public List<StockResponse> getAllStock() throws Exception  {
    Map<String, Integer> stocks = stockRepository.getAllStock();
    List<StockResponse> stockResponses = new ArrayList<>();
    for (String product : stocks.keySet()) {
        stockResponses.add(new StockResponse(product, stocks.get(product)));
    }
    return stockResponses;
}
```

Por último, en nuestro `StockResource` definimos un endpoint que retorne un objeto Response, definimos que su respuesta debe ser almacenada en caché, llamamos a nuestro servicio y retornamos la lista envuelta en un Response.

```java
@GET
@Produces(MediaType.APPLICATION_JSON)
@Cached(cacheName = "cache-list-stock-request")
public Response getAll () throws Exception {
    List<StockResponse> stockResponses = stockService.getAllStock();
    return Response.ok(stockResponses).build();
}
```

Por último, también definamos un endpoint de invalidación para nuestro nuevo caché:

```java
@GET
@Path("/invalidate-all-list")
@Produces(MediaType.APPLICATION_JSON)
@CachedInvalidateAll(cacheName = "cache-list-stock-request")
public String invalidateAll () {
    return "ok";
}
```

Ejecuten el proyecto y lancen una llamada al endpoint `/product`. Advertirán que la consulta tomará unos segundos. Ahora vuelvan a llamar y advertirán que ahora tomará milisegundos, pues leerá el objeto Response serializado en la primera llamada y almacenado en caché, y lo retornará integramente.

## Conclusión

A lo largo de este artículo hemos indicado cómo serializar y deserializar objetos de terceros para caching. Esto nos permite utilizar estructuras tales como Response o NewCookie de Jax-RS, que nos facilitan la construcción de los endpoints de nuestras APIs y aún así beneficiarnos de un caché distribuido facilmente administrable.