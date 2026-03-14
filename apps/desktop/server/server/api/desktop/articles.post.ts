import { saveArticle } from '~/db/client-data';

export default defineEventHandler(async event => {
  const body = await readBody<{
    device_id: string;
    account_id: number;
    fakeid: string;
    title: string;
    link: string;
    content?: string;
    author?: string;
    source_url?: string;
    cover_image?: string;
    publish_date?: string;
    read_count?: number;
    like_count?: number;
  }>(event);
  const { device_id, ...article } = body;
  if (!device_id || !article.title || !article.link) {
    throw createError({ statusCode: 400, message: '缺少 device_id / title / link' });
  }
  saveArticle(device_id, article);
  return { ok: true };
});
