import styles from './Parallax.module.scss';
const Parallax = () => {
  return (
    <div className={styles.parallaxContainer}>
      <div className={styles.parallax}></div>
      <div className={styles.parallaxCaption}>
        <div className={styles.developerName}>Leonel Sánchez</div>
        <div className={styles.subtitle}>Developer Blog</div>
      </div>
    </div>
  );
};

export default Parallax;
