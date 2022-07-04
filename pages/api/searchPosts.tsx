import { NextApiRequest, NextApiResponse } from 'next';
import Container from 'typedi';
import { PostService } from '../../services/PostService';
import { PostPagination } from '../../types/PostPagination';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { query } = req;
  const { search, language, page, itemsPerPage } = query;
  const postService = Container.get(PostService);
  const postsResults: PostPagination = postService.searchPosts(
    String(search).trim(),
    String(language),
    Number(page),
    Number(itemsPerPage)
  );
  res.status(200).json({
    data: postsResults,
  });
};

export default handler;
