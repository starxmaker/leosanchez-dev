import Hero from '../components/IndexComponents/Hero/Hero';
import ArticleItem from '../components/IndexComponents/ArticleItem/ArticleItem';
import style from '../styles/index.module.scss';
import { Post } from '../types/Post';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

type Properties = {
  posts: Post[];
};

const Home = (props: Properties) => {
  return (
    <div className={style.contentContainer}>
      {props.posts.length ? (
        <div>
          <div className="title"> Nuevo </div>
          <Hero
            title={props.posts[0].title}
            subtitle={props.posts[0].subtitle}
            imageUrl={props.posts[0].imageUrl}
            articleExcerpt={props.posts[0].excerpt}
            articleDate={props.posts[0].articleDate}
            articleReadingTime={props.posts[0].articleReadingTime}
          />
        </div>
      ) : null}
      {props.posts.length > 1 ? (
        <div>
          <div className="subtitle"> Más artículos </div>
          <div className={style.articleContainer}>
            {props.posts
              .filter((e, i) => i !== 0)
              .map((post, index) => (
                <ArticleItem
                  key={index}
                  title={post.title}
                  imageUrl={post.imageUrl}
                  articleDate={post.articleDate}
                  articleReadingTime={post.articleReadingTime}
                />
              ))}
          </div>

          <div className={style.viewMoreContainer}>
            <button className="primaryButton">Ver más artículos</button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const getStaticProps = () => {
  const files: string[] = fs.readdirSync(path.join('posts'));
  const posts: Post[] = files.map((file) => {
    const slug: string = file.replace('.md', '');
    const markdownWithMeta = fs.readFileSync(path.join('posts', file), 'utf8');
    const { data: frontmatter, content } = matter(markdownWithMeta);
    return {
      slug,
      title: frontmatter.title,
      subtitle: frontmatter.subtitle,
      imageUrl: frontmatter.imageUrl,
      articleBody: content,
      excerpt: frontmatter.excerpt,
      articleDate: frontmatter.timestamp,
      articleReadingTime: frontmatter.readingTime,
    };
  });
  return {
    props: {
      posts,
    },
  };
};

export default Home;
