import Header from '../components/LayoutComponents/Header/Header';
import Parallax from '../components/LayoutComponents/Parallax/Parallax';
import Footer from '../components/LayoutComponents/Footer/Footer';
import style from '././Layout.module.scss';
type Props = {
  children: React.ReactNode;
};

const Layout = ({ children }: Props) => {
  return (
    <div>
      <div className="headerContainer">
        <Header />
      </div>
      <Parallax />
      <div className={style.bodyContainer}>
        <div className={style.contentContainer}>{children}</div>
      </div>
      <div className="footerContainer">
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
