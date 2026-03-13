/**
 * 触发导出公众号epub
 */
import { getUserBiz, createUserBizTask, getUserBizTasksByUserBizId } from '../db/miniapp';
import { processUserBizTaskQueue } from '../services/task-processor';
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

    if (biz.article_count === 0) {
      return {
        code: -1,
        message: '请先同步文章',
      };
    }

    // 检查是否有进行中的任务
    const existingTasks = getUserBizTasksByUserBizId(userBizId);
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

    // 创建导出任务
    const task = createUserBizTask({
      id: uuidv4(),
      user_biz_id: userBizId,
      type: 'generate_epub',
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      created_at: Date.now(),
    });

    // 触发任务处理（非阻塞）
    processUserBizTaskQueue().catch(e => {
      console.error('Process user biz task queue error:', e);
    });

    return {
      code: 0,
      message: '导出任务已创建',
      data: {
        taskId: task.id,
        status: task.status,
      },
    };
  } catch (e) {
    console.error('User biz export error:', e);
    return {
      code: -1,
      message: '创建导出任务失败',
    };
  }
});