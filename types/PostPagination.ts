import { PostMetadata } from './PostMetadata';

export type PostPagination = {
  postsMetadata: PostMetadata[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
};
