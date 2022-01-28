import styles from './Header.module.scss';
import Drawer from '../Drawer/Drawer';
import Link from 'next/link';
import { useState } from 'react';
import { MenuItem } from '../../../types/MenuItem';

const menuItems: MenuItem[] = [
  {
    title: 'Inicio',
    url: '/',
  },
  {
    title: 'Entradas',
    url: '/entries',
  },
  {
    title: 'Sobre mí',
    url: '/about',
  },
];
const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const onDrawerOpen = () => {
    setIsDrawerOpen(true);
  };
  return (
    <div className={styles.mainContainer}>
      <Link href="/">
        <div className={styles.brandColumn}>
          <span className={styles.developerName}>Leonel Sánchez</span>
          <span className={styles.developerPosition}>Developer Blog</span>
        </div>
      </Link>
      <div className={styles.navigationColumn}>
        {menuItems.map((menuItem, index) => (
          <div className={styles.navigationItem} key={index}>
            <Link href={menuItem.url}>{menuItem.title}</Link>
          </div>
        ))}
      </div>
      <div className={styles.toggleMenuContainer}>
        <div className={styles.toggleMenuIcon} onClick={onDrawerOpen}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 0 24 24"
            width="24px"
            fill="currentColor"
          >
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </div>
      </div>
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
        }}
        items={menuItems}
      />
    </div>
  );
};

export default Header;
