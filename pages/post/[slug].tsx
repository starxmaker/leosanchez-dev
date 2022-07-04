import { PostService } from '../../services/PostService';
import { Post } from '../../types/Post';
import { PostMetadata } from '../../types/PostMetadata';
import style from '../../styles/post.module.scss';
import Image from 'next/image';
import 'highlight.js/styles/default.css';
import Container from 'typedi';

type Properties = {
  post: Post;
};

const Post = (props: Properties) => {
  const postService = Container.get(PostService);
  const parsedContent = postService.parse(props.post.articleBody);
  const localeDateString = new Date(
    props.post.metadata.articleDate
  ).toLocaleDateString();
  const localeTimeString = new Date(
    props.post.metadata.articleDate
  ).toLocaleTimeString();
  return (
    <div className={style.postContainer}>
      <div className={style.articleDate}>
        Publicado el {localeDateString} a las {localeTimeString}
      </div>
      <div className={style.articleMainPicture}>
        <Image
          src={props.post.metadata.imageUrl}
          layout={'fill'}
          objectFit={'cover'}
        />
      </div>
      <div className={style.imageCredit}>
        Foto de{' '}
        <a className={style.link} href={props.post.metadata.imageAuthorUrl}>
          {props.post.metadata.imageAuthorName}
        </a>{' '}
        en{' '}
        <a className={style.link} href={props.post.metadata.imageSourceUrl}>
          {props.post.metadata.imageSourceName}
        </a>
      </div>
      <div className={style.articleContainer}>
        <div className={style.articleTitle}>{props.post.metadata.title}</div>
        <div className={style.articleSubtitle}>
          {props.post.metadata.excerpt}
        </div>
        <div className={style.articleDetails}>
          <div className={style.articleAuthor}>
            Por {props.post.metadata.author}
          </div>
          <div className={style.articleTime}>
            <span className={style.articleReadingTimeIcon}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24px"
                viewBox="0 0 24 24"
                width="1em"
                fill="currentColor"
              >
                <path d="M0 0h24v24H0V0z" fill="none" />
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </span>
            {props.post.metadata.articleReadingTime} min de lectura
          </div>
        </div>
        <div className={style.articleBody}>
          <div
            dangerouslySetInnerHTML={{
              __html: parsedContent,
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export const getStaticPaths = async () => {
  const postService = Container.get(PostService);
  const postsMetadata: PostMetadata[] = postService.getAllPostMetadata();
  const paths = postsMetadata.map((post) => ({
    params: {
      slug: post.slug,
    },
  }));
  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps = ({ params: { slug } }) => {
  const postService = Container.get(PostService);
  const post = postService.getSinglePost(slug);
  return {
    props: {
      post,
    },
  };
};

export default Post;
