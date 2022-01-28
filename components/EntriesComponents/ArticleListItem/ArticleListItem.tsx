import style from './ArticleListItem.module.scss';
import Image from 'next/image';
import Link from 'next/link';

type Properties = {
  title: string;
  subtitle: string;
  imageUrl: string;
  articleDate: string;
  articleReadingTime: string;
};
const ArticleListItem = (props: Properties) => {
  return (
    <Link href="/post">
      <div className={style.articleListItemContainer}>
        <div className={style.articleInformation}>
          <div className={style.articleDate}>
            <span>{props.articleDate}</span>
          </div>
          <div className={style.articleTitle}>
            <span>{props.title}</span>
          </div>
          <div className={style.articleSubtitle}>
            <span>{props.subtitle}</span>
          </div>
          <div className={style.articleTime}>
            <span>{props.articleReadingTime}</span>
          </div>
        </div>
        <div className={style.articleMainPicture}>
          <Image src={props.imageUrl} layout={'fill'} objectFit={'cover'} />
        </div>
      </div>
    </Link>
  );
};

export default ArticleListItem;
