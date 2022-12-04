import style from '../styles/about.module.scss';
import Image from 'next/image';
const About = () => {
  return (
    <div className={style.aboutContainer}>
      <div className="title">Sobre mí</div>
      <div className={style.rowContainer}>
        <div className={style.aboutInformationContainer}>
          <p>
            Mi nombre es Leonel Sánchez y soy un desarrollador web y traductor
            provieniente de Chile. Aunque debo reconocer mi pasión por el
            desarrollo front end (principalmente por encontrarlo dinámico y
            creativo), también me he especializado en aplicaciones a nivel de
            servidor, siempre en busqueda de implementar una arquitectura
            robusta, confiable y escalable. Actualmente trabajo en el equipo de datos 
            no regulados de Tessera Data.
          </p>
          <p>
            En este último tiempo me he focalizado en la implementación de
            pruebas unitarias, en proyectos de cualquier nivel de stack. En la
            medida de lo posible, sigo una metodología TDD al momento de
            programar. Soy un firme partidario de que a medida que la aplicación
            comienza a escalar, las pruebas (no solo las unitarias) se hacen
            cada vez más necesarias para reducir el temor al cambio cuando hay
            que mantener o implementar mejoras y no romper funcionalidad previa
            de la que los usuarios dependen en sus labores y confian en su
            disponibilidad. Por ello, las pruebas deben ocupar una etapa
            infranqueable en el CI/CD.
          </p>
          <p>
            Con respecto a mis pasiones no tecnológicas, soy un fanático de los
            idiomas y las culturas. Hablo fluidamente el español y el inglés, y
            puedo desenvolverme en francés. Sin importar el país, amo las
            diferencias culturales y lingüísticas, cómo pueden variar nuestras
            respectivas cosmovisiones e influyen en nuestro día a día.
          </p>
          <p>
            El motivo de este blog no es otro que compartir mis descubrimientos
            y experimientos personales en ámbitos de tecnología con la comunidad
            (a la cuál todo desarrollador, sin excepción, depende
            completamente). Espero que puedan beneficiarse en gran medida de su
            contenido.
          </p>
          <div style={{display: "flex"}}>
            <div
              style={{ cursor: 'pointer' }}
              onClick={() =>
                (location.href =
                  'https://www.credly.com/badges/b5e84158-9863-413a-b8b9-41aaab42fbc0/public_url')
              }
            >
              <Image
                src={
                  'https://d1zce54be1puoh.cloudfront.net/badges/aws-certified-developer-associate.png'
                }
                width={150}
                height={150}
              />
            </div>
            <div
              style={{ cursor: 'pointer' }}
              onClick={() =>
                (location.href =
                  'https://www.credly.com/badges/8b31bda6-d5ec-4b95-aa58-47145037a2ce/public_url')
              }
            >
              <Image
                src={
                  'https://d1zce54be1puoh.cloudfront.net/badges/aws-certified-cloud-practitioner.png'
                }
                width={150}
                height={150}
              />
            </div>
            
            <div
              style={{ cursor: 'pointer' }}
              onClick={() =>
                (location.href =
                  'https://www.credly.com/badges/961b31f2-4d8d-470a-8145-4ee92d289284/public_url')
              }
            >
              <Image
                src={
                  'https://d1zce54be1puoh.cloudfront.net/badges/microsoft-certified-azure-fundamentals.png'
                }
                width={150}
                height={150}
              />
            </div>
          </div>
        </div>
        <div className={style.imageContainer}>
          <Image
            src={'https://d1zce54be1puoh.cloudfront.net/BLOG_AUTHOR_PIC.jpg'}
            layout={'fill'}
            objectFit={'cover'}
          />
        </div>
      </div>
    </div>
  );
};

export default About;
