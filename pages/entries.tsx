import style from '../styles/entries.module.scss';
import ArticleListItem from '../components/EntriesComponents/ArticleListItem/ArticleListItem';
import { Post } from '../types/Post';
import { PostService } from '../services/PostService';
import { PostMetadata } from '../types/PostMetadata';
import Container from 'typedi';

type Properties = {
  postsMetadata: PostMetadata[];
};

const Entries = (props: Properties) => {
  return (
    <div className={style.contentContainer}>
      <div className="title"> Entradas </div>
      <div className={style.articleContainer}>
        {props.postsMetadata.map((post, i) => (
          <ArticleListItem
            key={i}
            slug={post.slug}
            title={post.title}
            subtitle={post.excerpt}
            thumbnailUrl={post.thumbnailUrl}
            articleDate={post.articleDate}
            articleReadingTime={String(post.articleReadingTime)}
          />
        ))}
      </div>
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

export default Entries;
