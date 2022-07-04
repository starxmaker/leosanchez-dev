import matter from 'gray-matter';
import { Service } from 'typedi';
import { IMarkdownExtractorAdapter } from './IMarkdownExtractorAdapter';

@Service()
export class GraymatterAdapter implements IMarkdownExtractorAdapter {
  extractFrontmatter(rawFile: string): Record<string, any> {
    const { data: frontmatter } = matter(rawFile);
    return frontmatter;
  }
  extractContent(rawFile: string): string {
    const { content } = matter(rawFile);
    return content;
  }
}
