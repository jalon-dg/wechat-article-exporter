/**
 * 获取公众号详情
 */
import { getUserBiz, getUserBizTasksByUserBizId } from '../../db/miniapp';
import { z } from 'zod';

const querySchema = z.object({
  id: z.string().min(1),
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

  const { id } = result.data;

  try {
    const biz = getUserBiz(id);

    if (!biz) {
      return {
        code: -1,
        message: '公众号不存在',
      };
    }

    const tasks = getUserBizTasksByUserBizId(id);

    return {
      code: 0,
      message: 'success',
      data: {
        biz,
        tasks,
      },
    };
  } catch (e) {
    console.error('Get user biz detail error:', e);
    return {
      code: -1,
      message: '获取失败',
    };
  }
});