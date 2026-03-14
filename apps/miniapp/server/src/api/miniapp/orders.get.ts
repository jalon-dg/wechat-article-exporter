/**
 * 获取订单列表
 */
import { getAllOrders } from '../../db/miniapp';

export default defineEventHandler(async () => {
  try {
    const orders = getAllOrders();

    return {
      code: 0,
      message: 'success',
      data: {
        list: orders.map(order => ({
          orderId: order.id,
          bizName: order.biz_name,
          email: order.email,
          status: order.status,
          amount: order.amount,
          createdAt: order.created_at,
          completedAt: order.completed_at,
        })),
      },
    };
  } catch (e) {
    console.error('Get orders error:', e);
    return {
      code: -1,
      message: '查询失败',
      error: String(e),
    };
  }
});
