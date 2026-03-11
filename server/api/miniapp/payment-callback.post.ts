/**
 * 支付回调
 * 注意：这里应该是微信支付回调，需要验证签名
 */
import { handlePaymentCallback, processTaskQueue } from '~/server/services/task-processor';
import { z } from 'zod';

const paymentCallbackSchema = z.object({
  orderId: z.string().uuid(),
  paymentTime: z.number(),
});

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const result = paymentCallbackSchema.safeParse(body);
  if (!result.success) {
    return {
      code: -1,
      message: '参数错误',
      errors: result.error.errors,
    };
  }

  const { orderId, paymentTime } = result.data;

  try {
    const order = handlePaymentCallback(orderId, paymentTime);

    if (!order) {
      return {
        code: -1,
        message: '订单不存在',
      };
    }

    // 支付成功后触发一次队列处理（非阻塞）
    processTaskQueue().catch(e => {
      console.error('Process task queue error after payment:', e);
    });

    return {
      code: 0,
      message: '支付成功',
      data: {
        orderId: order.id,
        status: order.status,
      },
    };
  } catch (e) {
    console.error('Payment callback error:', e);
    return {
      code: -1,
      message: '处理失败',
    };
  }
});