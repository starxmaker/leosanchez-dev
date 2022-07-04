import Container from 'typedi';
import { FSAdapter } from '../adapters/FileSystemAdapter/FSAdapter';
import { GraymatterAdapter } from '../adapters/MarkdownExtractorAdapter/GraymatterAdapter';
import { MarkedAdapter } from '../adapters/MarkdownParserAdapter/MarkedAdapter';

export const setDefaultAdapters = () => {
  Container.set('FileSystemAdapter', new FSAdapter());
  Container.set('MarkdownExtractorAdapter', new GraymatterAdapter());
  Container.set('MarkdownParserAdapter', new MarkedAdapter());
};
