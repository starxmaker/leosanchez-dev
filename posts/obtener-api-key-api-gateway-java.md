---
title: "Obtener en Java las API Keys de nuestros servicios en API Gateway"
imageUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/obtener-api-key-api-gateway-java/cover.jpg"
thumbnailUrl: "https://leonel-sanchez-developer-blog.s3.amazonaws.com/obtener-api-key-api-gateway-java/thumbnail.jpg"
imageAuthorName: Silas Köhler
imageAuthorUrl: https://unsplash.com/@silas_crioco?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
imageSourceName: Unsplash
imageSourceUrl: https://unsplash.com/es/s/fotos/keys?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText
timestamp: '2022/02/27 09:49:00'
readingTime: 5
excerpt: "Quizás necesitemos acceder programáticamente a las API Keys creadas en API Gateway ¿Será posible hacerlo en Java?"
author: "Leonel Sánchez"
tags: 
    - "Java"
    - "Quarkus"
    - "AWS"
    - "API Gateway"
    - "API Keys"
---

# Obtener en Java las API Keys de nuestros servicios en API Gateway

En muchas ocasiones quizás necesitemos que nuestro servicio acceda a las API Keys creadas en API Gateway. En Internet  hay tutoriales para hacerlo tanto en Node como a través de CLI, pero no en Java. Por ello me puse a revisar el SDK v2 de AWS para Java y encontré una manera para hacerlo que aprovecho de compartir con la comunidad.

Para el caso de Quarkus o imagenes nativas, la compatibilidad no es out of the box. Lean el final de este mini tutorial para saber como hacerlo compatible.

## Instalación de dependencias

Primero debemos instalar ciertas dependencias. Para ello, en el apartado `dependencyManagement` de nuestro `pom.xml` agreguen lo siguiente:

    <dependencyManagement>
        <dependencies>
            <! -- ... -->
            <dependency>
                <groupId>software.amazon.awssdk</groupId>
                <artifactId>bom</artifactId>
                <version>2.17.137</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

Luego, agregan las siguientes dos dependencias en el apartado `dependencies` (no el que pertenece a `dependencyManagement`).

    <dependency>
        <groupId>software.amazon.awssdk</groupId>
        <artifactId>apigateway</artifactId>
    </dependency>
    <dependency>
      <groupId>software.amazon.awssdk</groupId>
      <artifactId>url-connection-client</artifactId>
    </dependency>

## Código

Ahora presentaré el fragmento del código Java que hace la consulta:

    try {

        // we define the ID of the api key to query
        String apiKeyId = "nombre_de_la_api_key";

        // we initialize the http client required for the sdk
        SdkHttpClient httpClient =  UrlConnectionHttpClient.builder().build();

        // we initialize the api gateway client
        ApiGatewayClient client = ApiGatewayClient.builder()
            .httpClient(httpClient)
            .build();

        // we build a request
        GetApiKeysRequest request = GetApiKeysRequest.builder()
            .includeValues(true) // we want the request to return the values of the api key
            .nameQuery(apiKeyId) // the id of the api key we want to query (remove this if you want all the api keys to return)
        .build();

        // we make the request
        GetApiKeysResponse response=client.getApiKeys(request);

        // we check if we received any response
        if(response.hasItems()){

            // api key was found
            String apiKey = response.items().get(0).value();
            LOG.info(apiKey);

        } else {

            // no api key was found
            LOG.error("No api key found");

        }
    } catch (Exception e) {

        // something went wrong
        e.printStackTrace();
         LOG.error("Unknown error");

    }

En resumen:

- Inicializamos un cliente HTTP para que el SDK pueda hacer sus respectivas consultas
- Inicializamos el cliente API Gateway y le añadimos el cliente HTTP inicializado.
- Construimos una petición que especifica el nombre de la API KEY que buscamos y especificamos que queremos su valor en el retorno.
- Hacemos la consulta
- Revisamos el objeto para ver la existencia de resultados.
- Extraemos el resultado

## Política necesaria

No olviden añadir esta política al rol de su servicio, especificando la región respectiva en la que su API Gateway lo expone:

    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "apigateway:GET",
                "Resource": "arn:aws:apigateway:YOUR_REGION::/apikeys",
                "Effect": "Allow"
            }
        ]
    }

## Pasos extra para Quarkus

La librería del cliente HTTP no es directamente compatible con el modo imagen nativa. Para hacerlo funcionar, debemos inyectar los siguientes argumentos en la compilación para así asegurarnos que el cliente se inicialice durante la ejecución y no en la construcción (como pasa con las clases en nativo).

`application.properties`: 

    # initialize this conflicting library at run time
    quarkus.native.additional-build-args=--initialize-at-run-time=org.apache.http.impl.auth.NTLMEngineImpl
