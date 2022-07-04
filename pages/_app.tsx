import 'reflect-metadata';
import { AppProps } from 'next/app';
import '../styles/globals.scss';
import Layout from '../layouts/Layout';
import { setDefaultAdapters } from '../environment/Environment';
import Head from 'next/head';

setDefaultAdapters();

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Head>
        <title>Leonel Sánchez | Developer Blog</title>
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
};

export default MyApp;
