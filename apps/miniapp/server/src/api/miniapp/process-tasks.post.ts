/**
 * 任务调度接口
 * 用于触发任务处理（可在定时任务或手动调用）
 */
import { processTaskQueue } from '../../services/task-processor';

export default defineEventHandler(async () => {
  try {
    await processTaskQueue();
    return {
      code: 0,
      message: '任务处理完成',
    };
  } catch (e) {
    console.error('Process tasks error:', e);
    return {
      code: -1,
      message: '任务处理失败',
      error: String(e),
    };
  }
});