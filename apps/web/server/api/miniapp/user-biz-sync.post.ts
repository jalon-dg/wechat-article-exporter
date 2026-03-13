/**
 * 触发同步公众号文章
 */
import { getUserBiz, createUserBizTask, getUserBizTask } from '~/server/db/miniapp';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const bodySchema = z.object({
  userBizId: z.string().min(1),
});

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const result = bodySchema.safeParse(body);

  if (!result.success) {
    return {
      code: -1,
      message: '参数错误',
      errors: result.error.errors,
    };
  }

  const { userBizId } = result.data;

  try {
    const biz = getUserBiz(userBizId);

    if (!biz) {
      return {
        code: -1,
        message: '公众号不存在',
      };
    }

    // 检查是否有进行中的任务
    const existingTasks = await import('~/server/db/miniapp').then(m => m.getUserBizTasksByUserBizId(userBizId));
    const pendingTask = existingTasks.find(t => t.status === 'pending' || t.status === 'processing');

    if (pendingTask) {
      return {
        code: -1,
        message: '已有进行中的任务',
        data: {
          taskId: pendingTask.id,
          status: pendingTask.status,
        },
      };
    }

    // 创建同步任务
    const task = createUserBizTask({
      id: uuidv4(),
      user_biz_id: userBizId,
      type: 'sync_articles',
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      created_at: Date.now(),
    });

    // 触发任务处理（非阻塞）
    import('~/server/services/task-processor').then(m => m.processUserBizTaskQueue().catch(e => {
      console.error('Process user biz task queue error:', e);
    }));

    return {
      code: 0,
      message: '同步任务已创建',
      data: {
        taskId: task.id,
        status: task.status,
      },
    };
  } catch (e) {
    console.error('User biz sync error:', e);
    return {
      code: -1,
      message: '创建同步任务失败',
    };
  }
});