/**
 * 查询用户公众号任务状态
 */
import { getUserBizTask } from '../../db/miniapp';
import { z } from 'zod';

const querySchema = z.object({
  taskId: z.string().min(1),
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

  const { taskId } = result.data;

  try {
    const task = getUserBizTask(taskId);

    if (!task) {
      return {
        code: -1,
        message: '任务不存在',
      };
    }

    return {
      code: 0,
      message: 'success',
      data: {
        task,
      },
    };
  } catch (e) {
    console.error('Get user biz task error:', e);
    return {
      code: -1,
      message: '获取失败',
    };
  }
});