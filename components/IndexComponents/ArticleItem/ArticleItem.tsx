import styles from './ArticleItem.module.scss';
import Image from 'next/image';
import Link from 'next/link';

type Properties = {
  title: string;
  imageUrl: string;
  articleDate: number;
  articleReadingTime: number;
};
const ArticleItem = (props: Properties) => {
  return (
    <Link href="/post">
      <div className={styles.articleItemContainer}>
        <div className={styles.articleMainPictureContainer}>
          <div className={styles.articleMainPicture}>
            <Image src={props.imageUrl} layout={'fill'} objectFit={'cover'} />
          </div>
        </div>
        <div className={styles.articleCaption}>
          <div className={styles.articleDate}>{props.articleDate}</div>
          <div className={styles.articleTitle}>{props.title}</div>
          <div className={styles.articleTime}>{props.articleReadingTime}</div>
        </div>
      </div>
    </Link>
  );
};

export default ArticleItem;
