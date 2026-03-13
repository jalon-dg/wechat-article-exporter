/**
 * 获取用户已购公众号列表
 */
import { getUserBizByUserId } from '~/server/db/miniapp';
import { z } from 'zod';

const querySchema = z.object({
  userId: z.string().min(1),
});

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const result = querySchema.safeParse(query);

  if (!result.success) {
    return {
      code: -1,
      message: '参数错误',
      errors: result.error.errors,
    };
  }

  const { userId } = result.data;

  try {
    const bizList = getUserBizByUserId(userId);

    return {
      code: 0,
      message: 'success',
      data: {
        list: bizList,
        total: bizList.length,
      },
    };
  } catch (e) {
    console.error('Get user biz list error:', e);
    return {
      code: -1,
      message: '获取失败',
    };
  }
});