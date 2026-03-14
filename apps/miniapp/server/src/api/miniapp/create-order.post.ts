/**
 * 创建订单
 */

import { z } from 'zod';
import { createMiniappOrder } from '../../services/task-processor';

const createOrderSchema = z.object({
  bizName: z.string().min(1),
  email: z.string().email(),
  price: z.number().optional(),
});

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const result = createOrderSchema.safeParse(body);
  if (!result.success) {
    return {
      code: -1,
      message: '参数错误',
      errors: result.error.errors,
    };
  }

  const { bizName, email, price = 500 } = result.data;

  try {
    const order = createMiniappOrder(bizName, email, price);

    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: order.id,
        amount: order.amount,
        bizName: order.biz_name,
        email: order.email,
        status: order.status,
      },
    };
  } catch (e) {
    console.error('Create order error:', e);
    return {
      code: -1,
      message: '创建订单失败',
    };
  }
});
