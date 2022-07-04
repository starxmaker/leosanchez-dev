import Hero from '../components/IndexComponents/Hero/Hero';
import ArticleItem from '../components/IndexComponents/ArticleItem/ArticleItem';
import style from '../styles/index.module.scss';
import { PostMetadata } from '../types/PostMetadata';
import { PostService } from '../services/PostService';
import { useRouter } from 'next/router';
import Container from 'typedi';

type Properties = {
  postsMetadata: PostMetadata[];
};

const Home = (props: Properties) => {
  const router = useRouter();
  return (
    <div className={style.contentContainer}>
      {props.postsMetadata.length ? (
        <div>
          <div className="title"> Nuevo </div>
          <Hero
            slug={props.postsMetadata[0].slug}
            title={props.postsMetadata[0].title}
            thumbnailUrl={props.postsMetadata[0].thumbnailUrl}
            articleExcerpt={props.postsMetadata[0].excerpt}
            articleDate={props.postsMetadata[0].articleDate}
            articleReadingTime={props.postsMetadata[0].articleReadingTime}
          />
        </div>
      ) : null}
      {props.postsMetadata.length > 1 ? (
        <div>
          <div className="subtitle"> Más artículos </div>
          <div className={style.articleContainer}>
            {props.postsMetadata
              .filter((e, i) => i !== 0)
              .map((post, index) => (
                <ArticleItem
                  key={index}
                  slug={post.slug}
                  title={post.title}
                  thumbnailUrl={post.thumbnailUrl}
                  articleDate={post.articleDate}
                  articleReadingTime={post.articleReadingTime}
                />
              ))}
          </div>

          <div className={style.viewMoreContainer}>
            <button
              className="primaryButton"
              onClick={() => router.push('/entries')}
            >
              Ver más artículos
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const getStaticProps = () => {
  const postService = Container.get(PostService);
  const postsMetadata: PostMetadata[] = postService.getAllPostMetadata();
  return {
    props: {
      postsMetadata,
    },
  };
};

export default Home;
