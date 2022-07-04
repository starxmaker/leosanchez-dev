import { Post } from '../types/Post';
import { IMarkdownExtractorAdapter } from '../adapters/MarkdownExtractorAdapter/IMarkdownExtractorAdapter';
import { GraymatterAdapter } from '../adapters/MarkdownExtractorAdapter/GraymatterAdapter';
import { IFileSystemAdapter } from '../adapters/FileSystemAdapter/IFileSystemAdapter';
import { FSAdapter } from '../adapters/FileSystemAdapter/FSAdapter';
import { PostMetadata } from '../types/PostMetadata';
import { IMarkdownParserAdapter } from '../adapters/MarkdownParserAdapter/IMarkdownParserAdapter';
import { PostPagination } from '../types/PostPagination';
import { Inject, Service } from 'typedi';

@Service()
export class PostService {
  postFolder: string = 'posts';

  @Inject('MarkdownExtractorAdapter')
  markdownExtractorProvider: IMarkdownExtractorAdapter;

  @Inject('FileSystemAdapter')
  fileSystemProvider: IFileSystemAdapter;

  @Inject('MarkdownParserAdapter')
  markdownParserAdapter: IMarkdownParserAdapter;

  getAllPosts(): Post[] {
    const files: string[] = this.fileSystemProvider.listFiles(
      this.postFolder,
      'md'
    );
    const posts: Post[] = files.map((file) => {
      return this.extractPost(file);
    });
    return posts.sort((a, b) => {
      return (
        new Date(b.metadata.articleDate).getTime() -
        new Date(a.metadata.articleDate).getTime()
      );
    });
  }

  getSinglePost(postName: string): Post | null {
    const postFileName: string = `${postName}.md`;
    if (this.fileSystemProvider.fileExists(this.postFolder, postFileName)) {
      return this.extractPost(postFileName);
    }
  }

  getAllPostMetadata(): PostMetadata[] {
    const files: string[] = this.fileSystemProvider.listFiles(
      this.postFolder,
      'md'
    );
    const posts: PostMetadata[] = files.map((file) => {
      return this.extractPostMetadata(file);
    });
    return posts.sort((a, b) => {
      return (
        new Date(b.articleDate).getTime() - new Date(a.articleDate).getTime()
      );
    });
  }

  getSinglePostMetadata(postName: string): PostMetadata | null {
    const postFileName: string = `${postName}.md`;
    if (this.fileSystemProvider.fileExists(this.postFolder, postFileName)) {
      return this.extractPostMetadata(postFileName);
    }
  }

  private extractPostMetadataFromFrontMatter(
    slug: string,
    frontmatter: Record<string, any>
  ): PostMetadata {
    return {
      slug,
      title: frontmatter.title,
      imageUrl: frontmatter.imageUrl,
      thumbnailUrl: frontmatter.thumbnailUrl,
      articleDate: frontmatter.timestamp,
      articleReadingTime: frontmatter.readingTime,
      excerpt: frontmatter.excerpt,
      tags: frontmatter.tags,
      author: frontmatter.author,
      imageAuthorName: frontmatter.imageAuthorName,
      imageAuthorUrl: frontmatter.imageAuthorUrl,
      imageSourceName: frontmatter.imageSourceName,
      imageSourceUrl: frontmatter.imageSourceUrl,
    };
  }

  private extractPost(fileName: string): Post {
    const markdownWithMeta: string = this.fileSystemProvider.readFile(
      this.postFolder,
      fileName
    );
    const slug: string = this.getSlugFromFileName(fileName);
    const content: string =
      this.markdownExtractorProvider.extractContent(markdownWithMeta);
    const frontmatter =
      this.markdownExtractorProvider.extractFrontmatter(markdownWithMeta);

    return {
      metadata: this.extractPostMetadataFromFrontMatter(slug, frontmatter),
      articleBody: content,
    };
  }

  private extractPostMetadata(fileName: string): PostMetadata {
    const markdownWithMeta: string = this.fileSystemProvider.readFile(
      this.postFolder,
      fileName
    );
    const slug: string = this.getSlugFromFileName(fileName);
    const frontmatter =
      this.markdownExtractorProvider.extractFrontmatter(markdownWithMeta);
    return this.extractPostMetadataFromFrontMatter(slug, frontmatter);
  }

  public getSlugFromFileName(fileName: string): string {
    return fileName.replace('.md', '');
  }

  public searchPosts(
    rawSearch: string = '',
    language: string = 'es',
    currentPage: number = 1,
    itemsPerPage = 10
  ): PostPagination {
    const desiredIndexesRange = [
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage - 1,
    ];
    // extract terms
    const searchTerms = rawSearch.split(' ');
    const postsMetadata: PostMetadata[] = this.getAllPostMetadata();
    const results = postsMetadata.filter((post) => {
      const searchText = `${post.title} ${post.tags.join(' ')}`;
      for (const searchTerm of searchTerms) {
        if (!searchText.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });
    const filteredResults = results.filter((r, i) => {
      return i >= desiredIndexesRange[0] && i <= desiredIndexesRange[1];
    });
    return {
      currentPage,
      itemsPerPage,
      postsMetadata: filteredResults,
      totalPages: Math.ceil(filteredResults.length / itemsPerPage),
      totalItems: filteredResults.length,
    };
  }

  public parse(articleBody: string) {
    return this.markdownParserAdapter.parse(articleBody);
  }
}
