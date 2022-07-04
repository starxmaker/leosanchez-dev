import 'reflect-metadata';
import { AppProps } from 'next/app';
import '../styles/globals.scss';
import Layout from '../layouts/Layout';
import { setDefaultAdapters } from '../environment/Environment';

setDefaultAdapters();

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
};

export default MyApp;
