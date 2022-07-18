---
title: "Cache distribuido con Redis y Quarkus"
imageUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-distributed-cache-with-redis/cover.jpg"
thumbnailUrl: "https://d1zce54be1puoh.cloudfront.net/quarkus-distributed-cache-with-redis/thumbnail.jpg"
imageAuthorName: Annie Spratt
imageAuthorUrl: https://unsplash.com/@anniespratt?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/on-demand?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022/07/11 00:22:00'
readingTime: 30
excerpt: "Quarkus ofrece una rápida y fácil manera de implementar un caché local para nuestras aplicaciones. ¿Será posible implementar un caché distribuido sin perder la declaratividad?"
author: "Leonel Sánchez"
tags: 
    - "Java"
    - "Quarkus"
    - "Redis"
    - "Cache"
    - "Distribuido"
---

# Cache distribuido con Redis y Quarkus

Quarkus posee una asombrosa librería que permite implementar un caché local en nuestras aplicaciones al incluir tan solo algunas anotaciones en nuestros endpoints o métodos. No me dedicaré a hacer una mayor introducción de la funcionalidad (si quieren saber más, pueden verlo [aquí](https://quarkus.io/guides/cache)), pero si destacaré su carácter declarativo, lo que permite una implementación rápida sin tener que adaptar nuestra lógica de negocios para ello.

No obstante, un caché local no es muy escalable. Si hacemos escalamiento horizontal, solo la instancia que creó el caché podrá beneficiarse de él. Esto trae problemas en el caso de que expongamos nuestras instancias en un balanceador de carga, ya que nada asegura que la misma instancia atienda las peticiones de un mismo usuario. Asimismo, si cada instancia tiene un caché local, la administración se vuelve una pesadilla.

De ahí es la idea de mantener el caché separado de las aplicaciones. Esto presenta muchas ventajas:
- Mayor facilidad de administración.
- Varias instancias se pueden beneficiar de él, lo que facilita la escalabilidad de nuestra aplicación.
- Los microservicios de corta duración de ejecución (como Lambdas u otras FaaS) pueden también disfrutar de sus beneficios.

No obstante, no es posible cambiar la arquitectura subyacente del caché local de Quarkus, por lo que hay que buscar otra forma de implementar nuestro caché distribuido. Si bien es cierto que el caché distribuido puede ser facilmente implementado si nos vamos por la vía imperativa, lo cierto es que tenemos que adaptar nuestra lógica de negocios para beneficiarnos de él, lo que aumenta la complejidad de nuestro código y, a la larga, su mantenibilidad. Por ello, el otro día encontré un excelente artículo del usuario *dvddhin* en Medium para implementar un caché distribuido con Quarkus e Infinispan (pueden leerlo [aquí](https://medium.com/geekculture/distributed-cache-layering-with-infinispan-and-quarkus-d8df4188efd4)). Como en mi trabajo se prefiere los servicios gestionados por AWS, quise expandir el concepto del artículo anterior para poder implementarlo con ElastiCache/Redis. Los resultados fueron gratificantes.

## Requisitos

Para llevar a cabo el tutorial, necesitamos lo siguiente:
- Un proyecto Quarkus
- Docker (para pruebas locales)
- Jackson
- Una instancia Redis (o un contenedor corriendo una imagen de ella)
- Las entradas y salidas del método al que se desea implementar el caché deben ser serializables y deserializables (aunque hay un workaround que veremos en el próximo artículo)

Cabe destacar que a pesar de que este artículo se concentrará en Quarkus, en teoría se aplica a todo framework (sea o no de Java) que permita interceptar las entradas y salidas de métodos.

Asimismo, si bien este artículo se enfoca en Redis, se podrá apreciar que mantenemos una abstracción de él. De esta forma, es posible usar otros proveedores de caché que cumplan nuestros casos de uso.


## Descripción del proyecto

Lo que necesitamos es una manera de interceptar las entradas y salidas de los métodos en los que deseamos implementar caché. En las entradas tomaremos el nombre del caché específico y le añadiremos como sufijo una llave generada a partir de los argumentos enviados o que marquemos como parte de la llave. Esto para hacer entradas individuales de caché en base a las entradas que recibimos y así también poder invalidar elementos individuales y no todo el caché. Por supuesto también se debe poder invalidar todas las entradas del caché. Se verificará esta llave creada contra nuestro proveedor de caché: si existe retornamos la respuesta almacenada, si no dejamos que el método siga y genere una respuesta, la cual guardaremos con la llave creada en el caché y le daremos un tiempo de expiración.

Las mayores problemáticas que trae consigo el proyecto son las siguientes:
- Serialización
- Generación de llave compuesta en base a argumentos
- Deserialización

Para ilustrar el concepto haremos un pequeño servicio de consulta de stock en el que podremos consultar por producto o reducir por una compra. Para evitar una supuesta sobrecarga de recursos al momento de buscar el stock, tendremos la respuesta en caché para así recuperarla ante similares consultas del mismo tipo.

Cabe destacar que todo el proyecto actual se encuentra en el [siguiente repositorio](https://github.com/starxmaker/quarkus-redis-distributed-cache)

## Configuración de adaptador de caché

Antes de comenzar a codificar nuestra lógica de negocios, construiremos un adaptador que se encargará de la comunicación con Redis, y así otorgarnos la posibilidad de cambiar de proveedor en el caso que lo necesitemos.

Primero definiremos una interfaz que señalará qué métodos esperamos ver implementados en nuestro adaptador de caché. Necesitamos la siguiente funcionalidad:
- Almacenar un valor bajo una llave
- Obtener el valor a partir de una llave
- Eliminar un valor en base a una llave
- Eliminar todos los valores cuya llave comience con un prefijo
- Establecer el tiempo de expiración de una entrada
- Verificar la existencia de una llave
- Obtener todas las llaves existentes que compartan un prefijo.

Aquí el código respectivo:

```java
public interface ICacheAdapter {
    void set(String key, String value);
    Optional<String> get(String key);
    void delete(String key);
    void deleteAllByPrefix(String prefix);
    void setExpire(String key, long seconds);
    boolean check(String key);
    List<String> obtainKeysByPrefix(String prefix);
}
```

Partamos entonces con la implementación del adaptador. Primero nos aseguraremos de tener el cliente Redis instalado. Basta verificar que tengamos la siguiente entrada en el `pom.xml`, y si no es así agregarlo:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-redis-client</artifactId>
</dependency>
```
Ahora pasaremos a crear una clase que implemente la interfaz previamente creada, la configuraremos como singleton e inyectaremos el cliente Redis.

```java
@ApplicationScoped
@LookupIfProperty(name = "cache.provider", stringValue = "redis")
public class RedisAdapter implements ICacheAdapter {
    @Inject
    RedisClient redisClient;
}
```

Como pueden verificar, definimos que si la propiedad `cache.provider` tiene el valor `redis`, cada vez que se busque inyectar nuestra interfaz, se inyectará este bean. 

Por otra parte también necesitamos indicar la url de nuestro servicio Redis. Si no tienen uno disponible, podemos correr un contenedor local con el siguiente comando:

```bash
docker run -d --name some-redis -p 6380:6379 redis
```

Asi que vamos a nuestro archivo `application.properties` y agregaremos el siguiente código

```properties
quarkus.redis.hosts=redis://localhost:6380
cache.provider=redis
```

<details>
<summary> Configuración de suite de pruebas de integración (opcional) </summary>

Antes de pasar a la implementación de nuestro adaptador, creemos una suite de pruebas:

```java
@QuarkusTest
@TestProfile(RedisAdapterIT.TestProfile.class)
public class RedisAdapterIT {
    
    @Inject
    RedisAdapter redisAdapter;

    @Container
    public static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:5.0.3-alpine"))
        .withExposedPorts(6379);

    public static class TestProfile implements QuarkusTestProfile {
            @Override
            public Map<String, String> getConfigOverrides() {
                redis.start();
                String containerUrl = "redis://" + redis.getHost() + ":" + redis.getFirstMappedPort();
                return new HashMap<String, String>() {
                    {
                        put("quarkus.redis.hosts", containerUrl);
                        put("cache.provider", "redis");
                    }
                };
    
            }
    }
}
```

En esta suite hacemos lo siguiente:
- Inyectamos nuestro adaptador
- Levantamos un contenedor Redis
- Definimos un perfil de prueba que extraerá la url del contenedor levantado y la inyectará en las propiedades

</details>

Pasemos a la implementación. Como verán en la mayoría de los casos nuestro adaptador solo hará de proxy al cliente. Comencemos con los métodos de obtención y almacenamiento por llave.

```java
@Override
public void set(String key, String value) {
    redisClient.set(List.of(key, value));
    
}

@Override
public Optional<String> get(String key) {
    Response response = redisClient.get(key);
    if(Objects.isNull(response)) {
        return Optional.empty();
    } else {
        return Optional.of(response.toString());
    }
}
```

Por un lado, nuestro método set es solo un proxy al cliente. Por otro nuestro método get se comunica con nuestro cliente y verifica si nuestra respuesta no es nula para enviarla en un wrapper que nos permite tener *null-safety*.

<details>
<summary> Pruebas de integración (opcional) </summary>
Definiremos una prueba que almacene una entrada, la recupere y luego verifique que los valores correspondan. Así aprovecharemos de verificar el funcionamiento de ambas funciones.

```java
@Test
public void testSetValue() {
    redisAdapter.set("llaveA", "valorA");
    Optional<String> obtainedValue = redisAdapter.get("llaveA");
    Assertions.assertEquals("valorA", obtainedValue.get());
}
```
</details>

Ahora pasemos a los métodos de eliminación. Necesitamos dos métodos, uno de eliminación de una entrada específica y otro por prefijo (recuerden que almacenaremos las clave usando el nombre del caché como prefijo seguido por la llave compuesta generada por los parámetros de la función).

Partamos con la primera función, la eliminación directa:

```java
@Override
public void delete(String key) {
    redisClient.del(List.of(key));
}
```

Como ven, es solo un proxy al cliente.

Pasemos al siguiente método: la eliminación por prefijo. Para ello, antes necesitamos implementar un método que nos traiga todas las llaves que correspondan con un prefijo:

```java
@Override
public List<String> obtainKeysByPrefix(String prefix) {
    List<String> keys = new ArrayList<>();
    Response response = redisClient.keys(prefix+"*");
    if(Objects.isNull(response)) {
        return keys;
    } else {
        String[] keysArray = response.toString()
            .replace("[", "")
            .replace("]", "")
            .split(",");
        for (String key : keysArray) {
            keys.add(key.trim());
        }
        return keys;
    }
}
```

Nuestro método hace lo siguiente:
- Llama a nuestro cliente con el prefijo y una wildcard para obtener toda llave que corresponda.
- Luego verifica si el mensaje obtenido no es nulo.
- Por último con métodos bastante rudimentarios, se limpia el string recibido y se extraen las llaves.
- Se retorna la lista generada.

Ya con este método implementado, podemos eliminar todas las llaves que coincidan con el prefijo:

```java
@Override
public void deleteAllByPrefix(String prefix) {
    List<String> keys = obtainKeysByPrefix(prefix);
    redisClient.del(keys);
}
```

Como ven, mando la lista recibida directamente a nuestro cliente Redis.

<details>
<summary> Pruebas de integración (opcional) </summary>

Partamos con una prueba de la eliminación simple. Almacenaré un valor, lo eliminaré y esperaré que cuando lo consulte retorne vacío.

```java
@Test
public void testDeleteValue() {
    redisAdapter.set("llaveB", "valorB");
    redisAdapter.delete("llaveB");
    Optional<String> obtainedValue = redisAdapter.get("llaveB");
    Assertions.assertTrue(obtainedValue.isEmpty());
}
```

Ahora pasemos a probar la obtención de llaves por prefijo. Definiremos dos entradas con el mismo prefijo, consultaremos por prefijo y verificamos que los resultados sean consistentes:

```java
@Test
public void getKeysByPrefix() {
    redisAdapter.set("prefijoA:llaveC", "valorC");
    redisAdapter.set("prefijoA:llaveD", "valorD");
    List<String> keys = redisAdapter.obtainKeysByPrefix("prefijoA:");
    Assertions.assertEquals(2, keys.size());
    Assertions.assertTrue(keys.contains("prefijoA:llaveC"));
    Assertions.assertTrue(keys.contains("prefijoA:llaveD"));
}
```

Por último, probemos la eliminación por prefijo. Definiremos dos entradas, las eliminaremos por prefijo y luego verificaremos que al consultarlas retornen vacío.

```java
@Test
public void testDeleteAllByPrefix() {
    redisAdapter.set("prefijoB:llaveE", "valorE");
    redisAdapter.set("prefijoB:llaveF", "valorF");
    redisAdapter.deleteAllByPrefix("prefijoB:");
    Optional<String> obtainedValue = redisAdapter.get("prefijoB:llaveE");
    Assertions.assertTrue(obtainedValue.isEmpty());
    obtainedValue = redisAdapter.get("prefijoB:llaveF");
    Assertions.assertTrue(obtainedValue.isEmpty());
}
```
</details>

Pasemos ahora a implementar la función que verificará si una llave existe.

```java 
@Override
public boolean check(String key) {
    Response response = redisClient.exists(List.of(key));
    return response.toString().equals("1");
}
```

Como ven es solo una función proxy que luego interpreta la respuesta recibida por el cliente.

<details>
<summary>Pruebas de integración (opcional)</summary>

Partamos con una prueba que señale que una llave sí existe. Para ello almacenaremos una entrada y verificaremos:

```java
@Test
public void testExistantKey() {
    redisAdapter.set("llaveH", "valorH");
    Assertions.assertTrue(redisAdapter.check("llaveH"));
}
```

Por último, verifiquemos el caso contrario con una llave que no exista.

```java
@Test
public void testCheckNotExistantKeys() {
    Assertions.assertFalse(redisAdapter.check("llaveG"));
}
```
</details>

Por último, implementemos el método que definirá el tiempo de vida de cada entrada:

```java
@Override
public void setExpire(String key, long seconds) {
    redisClient.expire(key, Long.toString(seconds));
}
```

Como ven, es solo una función proxy al cliente.

<details>
<summary>Pruebas de integración (opcional) </summary>

Definiremos una prueba en la que almacenaremos un valor y le daremos una vida de 5 segundos. Verificaremos que efectivamente exista, luego probaremos en 5 segundos más y comprobaremos que ya no esté.

```java
@Test
public void testExpire() throws Exception {
    redisAdapter.set("llaveI", "valorI");
    redisAdapter.setExpire("llaveI", 5);
    Optional<String> obtainedValue = redisAdapter.get("llaveI");
    Assertions.assertTrue(obtainedValue.isPresent());
    Thread.sleep(5000);
    obtainedValue = redisAdapter.get("llaveI");
    Assertions.assertTrue(obtainedValue.isEmpty());
}
```
</details>

Hemos terminado nuestro adaptador de caché. Ahora pasemos a construir el servicio que administrará el caché e implementará nuestra lógica de negocios.

## Construcción de servicio de administración de caché
Construiremos una capa que se comunicará con nuestro adaptador y con la cual los interceptores se comunicarán. 

```java
@ApplicationScoped
public class CachedService {

    @Inject
    ICacheAdapter cacheAdapter;

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

}
```

Antes de seguir, cabe destacar que hemos también creado un `objectMapper` de Jackson. Si observamos, también estamos configurándolo para utilizar `DefaultTyping` para todo tipo (`Object.class`). Hay que tener mucho cuidado con utilizar esta configuración en contextos tales como la deserialización de un payload obtenido directamente de una fuente externa. Esto porque el deserializador ahora buscará por el tipo al que debe mapear en el payload, lo que abre la puerta a poder enviar payloads con tipos vulnerables y así permitir ejecución remota de código. En este caso lo hemos utilizado en payloads que nosotros mismos hemos serializado y que provienen de una fuente interna, por lo que el riesgo de seguridad es menor.

Este servicio expondrá los siguientes métodos:
- Almacenar respuesta
- Recuperar respuesta
- Generar llave
- Verificar existencia de entrada
- Eliminar una entrada
- Eliminar todas las entradas

Partamos con el primer método: el almacenamiento de la respuesta. Recibiremos la clave, el objeto y un tiempo de expiración. Serializamos el objeto, lo guardamos y le colocamos el tiempo de vida:

```java
public void saveCachedResponse(String generatedKey, Object response, Integer expirationTime) throws JsonProcessingException{
    String serializedObject = objectMapper.writeValueAsString(response);
    cacheAdapter.set(generatedKey, serializedObject);
    cacheAdapter.setExpire(generatedKey, expirationTime);
}
```

Ahora vamos al método que recupera las respuestas. Pero antes de comenzarlo, implementaremos un método que deserializará el objeto serializado:

```java
private Object deserialize(String serializedObject) throws JsonProcessingException, JsonMappingException {
    return objectMapper.readValue(serializedObject, Object.class);
}
```

Como podemos ver, el método recibe el objeto serializado. Como activamos que al serializar un objeto se agregue su tipo, no es necesario que nosotros lo indiquemos, sino que el deserializador lo obtendrá del payload.

Luego, también es importante definir un método para saber si una entrada existe en el caché. No profundizaremos, pues es sólo un proxy al adaptador.

```java
public Boolean exists (String key) {
    return cacheAdapter.check(key);
}
```

Ahora podemos pasar a la implementación de la recuperación de la respuesta. Nuestro método obtendrá la respuesta del caché y deserializará en base a los tipos que definamos:

```java
public Optional<Object> retrieveCachedResponse(String key) throws JsonMappingException, JsonProcessingException{
    if (exists(key)){
        Optional<String> serializedObject = cacheAdapter.get(key);
        if (serializedObject.isPresent()) {
            Object response = deserialize(serializedObject.get());
            return Optional.of(response); 
        }
    }
    return Optional.empty();
}
```

Ahora debemos definir un método que genere nuestra llave compuesta en base a los argumentos recibidos y sus respectivas anotaciones. Pero antes necesitamos crear un método que filtre los parámetros en caso de que marque algunos para que solo esos sean parte de la clave.

Primero crearemos la anotación:

```java
@Retention(RetentionPolicy.RUNTIME)
@Target({ java.lang.annotation.ElementType.PARAMETER })
public @interface CachedKey {}
```

Y luego creamos nuestro método:

```java
private Object[] filterParameters (Object[] originalParameters, Annotation[][] parameterAnnotations) {
    List<Object> parameters = new ArrayList<>();
    for (int i = 0; i < originalParameters.length; i++) {
        Annotation[] annotations = parameterAnnotations[i];
        for (Annotation annotation : annotations) {
            if (annotation instanceof CachedKey) {
                parameters.add(originalParameters[i]);
            }
        }
    }
    if (parameters.isEmpty()) {
        return originalParameters;
    } else {
        return parameters.toArray();
    }
}
```

Este método filtrará la lista de parámetros en busqueda de los que estén marcados con nuestra anotación. Si filtra más de uno envía los filtrados. Si no, los envía todos.

Ahora tenemos que definir la forma en la que se generará la llave compuesta en base a los parámetors. Aquí entra la polémica. Una opción sería generar hashcodes de nuestros objetos, pero dos instancias de una misma clase con los mismos datos pueden generar códigos distintos y dos instancias diferentes pueden generar el mismo (situación llamada colisión). Esto último también conllevaría sobrescribir los métodos de comparación y obtención de hashCode y puede ser que no podamos hacer eso si las clases son obtenidas por dependencias. Por ello, el camino que tomé fue serializar y concatenar cada parámetro obtenido y luego generar con la cadena obtenida una llave codificada en SHA1 (cuya posibilidad de colisión es prácticamente imposible). Asi me aseguro que dos objetos distintos de la misma clase con los mismos datos sean considerados iguales y que dos objetos completamente distintos no me den la misma llave. Sé que mi solución puede ser muy rudimentaria, pero no soy dogmático e invito a que puedan implementar mejores formas de obtener una llave en base a los parámetros:

```java
private String generateCompositeKey(Object[] parameters) throws Exception {
    if (parameters.length == 0) {
        return "0";
    } else {
        String concatenatedValues = "";
        for (Object parameter : parameters) {
            concatenatedValues += objectMapper.writeValueAsString(parameter);
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        digest.reset();
        digest.update(concatenatedValues.getBytes("utf8"));
        String sha1 = String.format("%040x", new BigInteger(1, digest.digest()));
        return sha1;
    }
}
```

Si el método no trae parámetros, genera una llave por defecto. Si los envía, como se mencionó anteriormente, serializa cada parámetro, los concatena y genera una llave códificada en SHA1.

Una vez definidos estos métodos es posible crear nuestro método generador de llave. Este obtendrá todos los parámetros y las anotaciones, las filtrará, generará una llave compuesta en base a los parámetros filtrados y luego concatenará esta llave generada con el nombre del caché como prefijo.

```java
public String generateKey(String cacheName, Object[] parameters, Annotation[][] annotations) throws Exception {
    Object[] filteredParameters = filterParameters(parameters, annotations);
    String compositeKey = generateCompositeKey(filteredParameters);
    return cacheName + ":" + compositeKey;
}
```

Ahora definiremos rápidamente los métodos para eliminar una entrada de caché o borrar el caché completo. No entraré en mayores detalles pues, como podrán ver, solo se trata de proxies:

```java
public void removeSingleEntry(String key) {
    cacheAdapter.delete(key);
}
public void removeAll(String cacheName) {
    cacheAdapter.deleteAllByPrefix(cacheName);
}
```

## Interceptores
Ahora necesitamos implementar tres interceptores: uno para indicar que deseamos que los resultados de un método sean guardados en caché; otro para indicar que al llamar un método, elimine el caché que corresponda en parámetros; y por último otro para indicar que al llamar al método se eliminen todas las entradas del caché. Como ya implementamos toda su lógica en el servicio creado anteriormente, su implementación será bastante rápida.

### Interceptor para guardar caché

Primero debemos crear una anotación personalizada que recibirá el nombre del caché dónde se guardará el resultado del método:

```java
@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.METHOD, ElementType.TYPE })
public @interface Cached {
    @Nonbinding String cacheName();
}
```

Ahora definiremos la clase que definirá la lógica del interceptor:

```java
@Interceptor
@Priority(10000)
@CachedInvalidate(cacheName = "")
public class CachedInvalidateInterceptor {

    @Inject
    CachedService cachedService;

    @Inject
    Logger LOG;

}
```

Primero definimos que hacemos referencia a un interceptor. Luego definimos la prioridad en la que será llamado nuestro interceptor (a menor número antes ocurre). Posteriormente indicamos qué anotación corresponde al interceptor. Por último, inyectamos nuestro servicio de caché y un log.

Antes de pasar a la implementación del interceptor, desarrollaremos una función que obtendrá el tiempo de expiración para cada caché de `application.properties` o entregue un valor por defecto (1 hora):

```java
private Integer getExpirationTime(String cacheName){
    String propertyKey = "cache." + cacheName + ".expiration";
    Optional<Integer> maybeCacheDuration = ConfigProvider.getConfig().getOptionalValue(propertyKey, Integer.class);
    if (maybeCacheDuration.isPresent()) {
        return maybeCacheDuration.get();
    } else {
        return 60 * 60; // 1 hour
    }
}
```

Como vemos, busca la propiedad `cache.{nombre}.expiration` que le indique la cantidad de segundos que vivirá cada caché. Si la encuentra la retorna. Si no, entrega 1 hora.

Ahora implementaremos la lógica de nuestro interceptor:

```java
@AroundInvoke
<T> Object checkCache(InvocationContext context) throws Exception {
    // retrieve the annotation to retrieve the cache name
    Cached cachedAnnotation = context.getMethod().getAnnotation(Cached.class);
    // generate the key based on the cache name, parameters and parameter annotations
    String generatedKey = cachedService.generateKey(cachedAnnotation.cacheName(), context.getParameters(),
            context.getMethod().getParameterAnnotations());
    LOG.info("Returning cached response");
    // look up for a saved response
    Optional<Object> cachedValue = cachedService.retrieveCachedResponse(generatedKey,
            context.getMethod().getReturnType(), context.getMethod().getParameterTypes());
    if (cachedValue.isPresent()) {
        // return response if exists
        return cachedValue.get();
    } else {
        // continue the flow if not
        LOG.info("No cache found, generating");
        Object response = context.proceed();
        // retrieve the expirationTime
        Integer expirationTime = getExpirationTime(cachedAnnotation.cacheName());
        // save the generated response
        cachedService.saveCachedResponse(generatedKey, response, expirationTime);
        //return the response
        return response;
    }
}

```

Primero anotamos nuestro método con la anotación `@AroundInvoke` y así nuestro interceptor ejecutará la lógica interna cuando el método sea ejecutado. Obtendremos la anotación del interceptor para recibir el nombre del caché. Luego nos vamos a nuestro servicio de caché y generaremos una llave en base al nombre recibido, los parámetros y las anotaciones de los parámetros. Posteriormente verifico si hay algún registro con la llave generada: si la hay la envío de vuelta, si no, dejo que el método continue, genere una respuesta y la almaceno con el tiempo de expiración obtenido en la configuración.

### Interceptor para invalidación de entrada
Primero definamos la anotación del interceptor que igualmente requiere el nombre del caché para saber qué caché borrar:

```java
@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.METHOD, ElementType.TYPE })
public @interface CachedInvalidate {
    @Nonbinding String cacheName();
}
```

Ahora implementemos la lógica de nuestro interceptor:

```java
@Interceptor
@Priority(10000)
@CachedInvalidate(cacheName = "")
public class CachedInvalidateInterceptor {
    @Inject
    CachedService cachedService;

    @Inject
    Logger LOG;

    @AroundInvoke
    <T> Object invalidateCache(InvocationContext context) throws Exception {
        CachedInvalidate cachedAnnotation = context.getMethod().getAnnotation(CachedInvalidate.class);
        String generatedKey = cachedService.generateKey(cachedAnnotation.cacheName(), context.getParameters(),
                context.getMethod().getParameterAnnotations());
        if (cachedService.exists(generatedKey)) {
            LOG.info("Invalidating cache");
            cachedService.removeSingleEntry(generatedKey);
        }
        return context.proceed();
    }
}
```

Como en el caso anterior, marcamos nuestra clase como interceptora, le definimos una prioridad y le indicamos la anotación correspondiente. Inyectamos el servicio y el log y definimos en el método que se llamará al interceptar. Dentro de él obtenemos el nombre del caché a partir de la anotación, generamos la clave en base a los parámetros obtenidos y eliminamos la entrada de caché si hay correspondencia. Por último, dejamos seguir el flujo de la invocación.

### Interceptor para invalidar todas las entradas de un caché

Partemos con la anotación. Al igual que los casos anteriores, necesito saber el nombre del caché:

```java
@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.METHOD, ElementType.TYPE })
public @interface CachedInvalidateAll {
    @Nonbinding String cacheName();
}
```

Ahora definamos la lógica del interceptor:

```java
@Interceptor
@Priority(10000)
@CachedInvalidateAll(cacheName = "")
public class CachedInvalidateAllInterceptor {
    @Inject
    CachedService cachedService;

    @Inject
    Logger LOG;

    @AroundInvoke
    <T> Object invalidateCache(InvocationContext context) throws Exception {
        CachedInvalidateAll cachedAnnotation = context.getMethod().getAnnotation(CachedInvalidateAll.class);
        cachedService.removeAll(cachedAnnotation.cacheName());
        LOG.info("all cache entries removed for cache: " + cachedAnnotation.cacheName());
        return context.proceed();
    }
}
```

Definimos que es un interceptor, su prioridad, y la anotación correspondiente. Luego, inyectamos el servicio de caché y el log. Por último, en el método invocado por el interceptor, obtengo el nombre del caché de la anotación, elimino todas las entradas del caché y permito seguir el flujo.

<details>
<summary>Pruebas de integración (opcional)</summary>

Primero definamos la suite de pruebas, lanzamos un contenedor y sobrescribimos las propiedades de la aplicación.

```java
@QuarkusTest
@TestProfile(CachedServiceIT.TestProfile.class)
public class CachedServiceIT {

    @Container
    public static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:5.0.3-alpine"))
        .withExposedPorts(6379);

    public static class TestProfile implements QuarkusTestProfile {
            @Override
            public Map<String, String> getConfigOverrides() {
                redis.start();
                String containerUrl = "redis://" + redis.getHost() + ":" + redis.getFirstMappedPort();
                return new HashMap<String, String>() {
                    {
                        put("quarkus.redis.hosts", containerUrl);
                        put("cache.cache-quicklyexpired.expiration", "2");
                    }
                };
            }
    }
}
```

Nótese que también estamos definiendo en las propiedades un tiempo de expiración de dos segundos para los cachés con nombre `cache-quicklyexpired`.

Ahora definamos métodos anotados en los que podemos hacer pruebas. Nótese que cada método (excepto los invalidadores) retorna un String generado al azar. De esta forma si hay dos invocaciones con caché activado, deberían entregar la misma respuesta. En caso contrario, debería entregarme dos respuestas distintas.

Cache sin argumentos:
```java
@Cached(cacheName =  "cache-noarguments")
public String noArguments() {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
```

Caché con expiración rápida:
```java
@Cached(cacheName =  "cache-quicklyexpired")
public String quicklyExpired() {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
```

Caché con un argumento e invalidadores:
```java
@Cached(cacheName =  "cache-oneargument")
public String oneArgument(String argument) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}

@CachedInvalidate(cacheName = "cache-oneargument")
public void invalidateSingleCache(String argument) {
}

@CachedInvalidateAll(cacheName = "cache-oneargument")
public void invalidateAllCache() {
}
```

Caché de métodos con diferentes tipos de parámetros.
```java
@Cached(cacheName = "cache-differentargumenttypes")
public String differentArgumentsInt(Integer argument) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
@Cached(cacheName = "cache-differentargumenttypes")
public String differentArgumentsString(String argument) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
```

Caché con parámetro marcado específicamente como llave:
```java
@Cached(cacheName = "cache-onecachekey")
public String twoArgumentWithOneCacheKey(@CachedKey String argument, String secondArgument) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}

@Cached(cacheName = "cache-onecachekey")
public String oneArgumentNoCacheKey(String argument) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
```

Caché con dos argumentos:
```java
@Cached(cacheName = "cache-twoarguments")
public String differentOrder(String argument, Integer argument2) {
    UUID uuid = UUID.randomUUID();
    return uuid.toString();
}
```

Comencemos con una prueba simple sin parámetros en los que verificamos que dos llamadas al mismo método nos entreguen el mismo resultado:

```java
@Test
public void testCheckCachedResponse(){
    String response = noArguments();
    String response2 = noArguments();
    Assertions.assertEquals(response, response2);
}
```

Ahora probemos que el caché efectivamente se expire. Llamamos una vez método, almacenamos la respuesta, esperamos 3 segundos (más arriba definimos que durase 2 segundos), llamamos y almacenamos nuevamente la respuesta y finalmente comparamos. No deberían ser iguales:

```java
@Test
public void testCachedResponseExpiration() throws Exception {
    String response = quicklyExpired();
    Thread.sleep(3000);
    String response2 = quicklyExpired();
    Assertions.assertNotEquals(response, response2);
}
```

Ahora probamos que un método llamado con diferentes parámetros del mismo tipo retorne distintos valores (por tener entradas distintas de caché):

```java
@Test
public void testCacheDifferentKeyValues(){
    String firstResponse = oneArgument("A.First");
    String secondResponse = oneArgument("A.Second");
    Assertions.assertNotEquals(firstResponse, secondResponse);
}
```

Ahora probaremos la invalidación de entradas. Llamaremos a un método dos veces con diferentes parámetros del mismo tipo (invocación A e invocación B) y almacenaremos sus respuestas. Luego invalidaremos el caché con solamente los parámetros de invocación A. Luego reinvocamos la invocación A y B y confirmamos que las respuestas de la invocación A sean distintas y las de B iguales:

```java
@Test
public void testSingleCacheInvalidation() {
    String firstResponse = oneArgument("D.First");
    String secondResponse = oneArgument("D.Second");
    invalidateSingleCache("D.First");
    String lateFirstResponse = oneArgument("D.First");
    String lateSecondResponse = oneArgument("D.Second");
    Assertions.assertNotEquals(firstResponse, lateFirstResponse);
    Assertions.assertEquals(secondResponse, lateSecondResponse);
}
```

Ahora verificaremos la invalidación completa. Seguiremos el mismo modelo de la prueba anterior, solo que al invalidar completamente, ahora los valores de la invocación A y B deben ser distintos en comparación a sus respectivas reinvocaciones:

```java
@Test
public void testAllCacheInvalidation() {
    String firstResponse = oneArgument("D.First");
    String secondResponse = oneArgument("D.Second");
    invalidateAllCache();
    String lateFirstResponse = oneArgument("D.First");
    String lateSecondResponse = oneArgument("D.Second");
    Assertions.assertNotEquals(firstResponse, lateFirstResponse);
    Assertions.assertNotEquals(secondResponse, lateSecondResponse);
}
```

Seguimos con una prueba de caché compartido por dos métodos con parámetros de diferente tipo, pero en la práctica mismo valor. Se espera que generen respuestas distintas:

```java
@Test
public void testCacheDifferentParameterTypes() {
    String response = differentArgumentsInt(1);
    String response2 = differentArgumentsString("1");
    Assertions.assertNotEquals(response, response2);
}
```

A continuación, probaremos un caché compartido por dos métodos con diferente cantidad de parámetros, pero uno de ellos tiene marcado el primer parámetro para ser parte de la clave, resultando que ambos métodos tengan la misma cantidad de parámetros filtrados y que ambos retornen el mismo resultado:

```java
@Test
public void testCacheKey(){
    String firstResponse = twoArgumentWithOneCacheKey("B.First", "B.Second");
    String secondResponse = oneArgumentNoCacheKey("B.First");
    Assertions.assertEquals(firstResponse, secondResponse);
}
```

Por último definiremos una prueba que llama a un método dos veces con los mismos valores en los parámetros, pero en orden invertido. Debería entregar un valor distinto:

```java
@Test
public void testCacheDifferentOrder(){
    String firstResponse = twoArgumentWithOneCacheKey("C.First", "C.Second");
    String secondResponse = twoArgumentWithOneCacheKey("C.Second", "C.First");
    Assertions.assertNotEquals(firstResponse, secondResponse);
}
```
</details>

Hemos terminado el desarrollo de nuestro sistema de caché. Ahora procederemos a probarlo con un ejemplo simple.

## Recurso de ejemplo - Verificación de Stock

Probaremos nuestro caché con una serie de endpoints simples. Comencemos definiendo la respuesta que se enviará y se almacenará en el caché. Este contendrá el nombre del producto, el stock actual y la última verificación:

```java
@RegisterForReflection
public class StockResponse {
    private String product;
    private Integer availableStock;
    private Date lastUpdate;

    public StockResponse() {}

    public StockResponse(String product, Integer availableStock) {
        this.product = product;
        this.availableStock = availableStock;
        this.lastUpdate = new Date();
    }
    // getters and setters
}
```

Perfecto, ahora definamos un pseudorepositorio que simulará una fuente de datos que contiene los stocks por producto. Le definiremos un método para obtener el stock y otro para reducirlo. Al método de obtención de stock simularemos una demora de 3000 ms.

```java
@ApplicationScoped
public class StockRepository {

    Map<String, Integer> stocks = new HashMap<> (){{
        put("APPLE", 50);
        put("BANANA", 40);
        put("GRAPES", 30);
    }};

    public Integer getStock(String product) throws Exception {
        Thread.sleep(3000); // lets simulate a request time
        Integer stock = stocks.get(product);
        if (stock == null) {
            throw new Exception("Product not found");
        }
        return stock;
    }

    public void reduceStock(String product, Integer quantity) throws Exception {
        Integer stock = stocks.get(product);
        if (stock == null) {
            throw new Exception("Product not found");
        }
        Integer newStock = stock - quantity;
        if (newStock < 0) {
            throw new Exception("Not enough stock");
        }
        stocks.put(product, newStock);
    }
    
}
```

Perfecto, ahora implementemos un servicio que comunicará el recurso (con sus endpoints) con nuestro repositorio.

```java

@ApplicationScoped
public class StockService {
    @Inject
    StockRepository stockRepository;
    
    public StockResponse getStock(String product) throws Exception {
        Integer stock = stockRepository.getStock(product);
        return new StockResponse(product, stock);
    }

    public void purchase(String productName, Integer quantity) throws Exception {
        stockRepository.reduceStock(productName, quantity);   
    }
}
```

Por último, definamos un recurso y coloquemos tres endpoints:
- */product/{nombre}* para verificar el stock de un producto (se guarda en caché)
- */product/purchase?product={nombre}&quantity={cantidad}* para reducir el stock (invalida caché específico)
- */product/invalidate-all* para obligar a cada consulta a volver a calcular el stock (invalidación de todas las entradas del caché)

```java
@Path("/product")
public class StockResource {

    @Inject
    StockService stockService;
    
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Cached(cacheName = "cache-stock-request")
    @Path("/{name}")
    public StockResponse check (@PathParam("name") String productName) throws Exception {
        return stockService.getStock(productName);
    }

    @POST
    @Produces(MediaType.APPLICATION_JSON)
    @CachedInvalidate(cacheName = "cache-stock-request")
    @Path("/purchase")
    public String purchase (@CachedKey @QueryParam ("product") String productName, @QueryParam ("quantity") Integer quantity) throws Exception {
        stockService.purchase(productName, quantity);
        return "Ok";
    }

    @GET
    @Path("/invalidate-all")
    @Produces(MediaType.APPLICATION_JSON)
    @CachedInvalidateAll(cacheName = "cache-stock-request")
    public String invalidateAll () {
        return "ok";
    }
}
```

Levanten el proyecto con `quarkus dev` y hagan una consulta GET a `/product/APPLE`. Comprobarán que toma unos cuantos segundos. Ahora repitanla y comprobarán que ahora toma milisegundos.

Ahora simulen una compra haciendo una consulta POST a `/product/purchase?product=APPLE&quantity=2` y luego vuelvan a consultar el stock por el producto. Verificarán que vuelve a demorarse el mismo tiempo de la primera llamada y el stock se ve actualizado.

## Conclusión

Acabamos de ver una forma de implementar de manera declarativa un caché distribuido en Quarkus. Esto nos facilitará la administración del caché en sistemas con *autoscaling* detrás de un balanceador de carga o que sirve a más de una aplicación.

No obstante, si dejamos las cosas como están la siguiente consulta fallará:

```java
@GET
@Path("/{name}/shipping-times")
@Cached(cacheName="cache-shipping-times")
@Produces(MediaType.APPLICATION_JSON)
public Response query(@PathParam("name") String productName) {
    // ..
    return Response.ok().build();
}
```

Esto ocurre debido a que Response, si bien puede ser serializado por Jackson, no puede ser deserializado *out of the box*. Para que el caché pueda funcionar, necesitamos implementar un deeserializador personalizado, lo que veremos en el siguiente artículo.