import { MenuItem } from '../../../types/MenuItem';
import style from './/Drawer.module.scss';
import Link from 'next/link';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];
};

const Drawer = ({ isOpen, onClose, items }: Props) => {
  return (
    <div>
      <div
        className={`${style.grayedOutScreen} ${isOpen ? style.open : ''}`}
      ></div>
      <div className={`${style.drawerContainer} ${isOpen ? style.open : ''}`}>
        <div className={style.drawerBody}>
          <div className={style.itemContainer}>
            {items.map((item, index) => (
              <div className={style.item} key={index}>
                <Link href={item.url}>
                  <a onClick={onClose}>{item.title}</a>
                </Link>
              </div>
            ))}
          </div>
          <div className={style.closeIcon} onClick={onClose}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 0 24 24"
              width="24px"
              fill="currentColor"
            >
              <path d="M0 0h24v24H0V0z" fill="none" />
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Drawer;
