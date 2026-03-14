/**
 * 查询订单状态
 */
import { getOrderStatus } from '../../services/task-processor';

interface OrderStatusQuery {
  orderId: string;
}

export default defineEventHandler(async event => {
  const query = getQuery<OrderStatusQuery>(event);

  if (!query.orderId) {
    return {
      code: -1,
      message: 'orderId不能为空',
    };
  }

  try {
    const result = getOrderStatus(query.orderId);

    if (!result) {
      return {
        code: -1,
        message: '订单不存在',
      };
    }

    return {
      code: 0,
      message: 'success',
      data: {
        orderId: result.order.id,
        bizName: result.order.biz_name,
        email: result.order.email,
        status: result.order.status,
        amount: result.order.amount,
        createdAt: result.order.created_at,
        completedAt: result.order.completed_at,
        tasks: result.tasks.map(t => ({
          id: t.id,
          type: t.type,
          status: t.status,
          progress: t.progress,
          error: t.error,
        })),
      },
    };
  } catch (e) {
    console.error('Get order status error:', e);
    return {
      code: -1,
      message: '查询失败',
      error: String(e),
    };
  }
});
