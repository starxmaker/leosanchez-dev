import styles from './Hero.module.scss';
import Image from 'next/image';
import Link from 'next/link';
type Properties = {
  title: string;
  subtitle: string;
  imageUrl: string;
  articleExcerpt: string;
  articleDate: number;
  articleReadingTime: number;
};
const Hero = (props: Properties) => {
  return (
    <Link href="/post">
      <div className={styles.heroContainer}>
        <div className={styles.articleMainPicture}>
          <Image src={props.imageUrl} layout={'fill'} objectFit={'cover'} />
        </div>
        <div className={styles.articleSummaryContainer}>
          <div className={styles.articleDate}>{props.articleDate}</div>
          <div className={styles.articleTitle}>{props.title}</div>
          <div className={styles.articleDescription}>{props.subtitle}</div>
          <div className={styles.articleSummary}>{props.articleExcerpt} </div>
          <div className={styles.articleTime}>{props.articleReadingTime}</div>
        </div>
      </div>
    </Link>
  );
};

export default Hero;
