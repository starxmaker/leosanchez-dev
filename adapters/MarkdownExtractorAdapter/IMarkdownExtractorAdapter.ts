import { PostMetadata } from '../../types/PostMetadata';

export interface IMarkdownExtractorAdapter {
  extractFrontmatter(rawFile: string): Record<string, any>;
  extractContent(rawFile: string): string;
}
