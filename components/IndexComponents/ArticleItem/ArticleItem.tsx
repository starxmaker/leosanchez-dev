import styles from './ArticleItem.module.scss';
import Image from 'next/image';
import Link from 'next/link';

type Properties = {
  slug: string;
  title: string;
  thumbnailUrl: string;
  articleDate: string;
  articleReadingTime: number;
};
const ArticleItem = (props: Properties) => {
  const localeDateString = new Date(props.articleDate).toLocaleDateString();
  const localeTimeString = new Date(props.articleDate).toLocaleTimeString();
  return (
    <Link href={`/post/${props.slug}`}>
      <div className={styles.articleItemContainer}>
        <div className={styles.articleMainPictureContainer}>
          <div className={styles.articleMainPicture}>
            <Image
              src={props.thumbnailUrl}
              layout={'fill'}
              objectFit={'cover'}
            />
          </div>
        </div>
        <div className={styles.articleCaption}>
          <div className={styles.articleDate}>
            {localeDateString} - {localeTimeString}
          </div>
          <div className={styles.articleTitle}>{props.title}</div>
          <div className={styles.articleTime}>
            <span className={styles.articleReadingTimeIcon}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="1em"
                viewBox="0 0 24 24"
                width="1em"
                fill="currentColor"
              >
                <path d="M0 0h24v24H0V0z" fill="none" />
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </span>
            {props.articleReadingTime} min de lectura
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ArticleItem;
