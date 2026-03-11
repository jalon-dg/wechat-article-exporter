const API_BASE = 'https://your-api-domain.com';

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
}

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data } = options;
  const fullUrl = url.startsWith('http') ? url : API_BASE + url;

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const response = res.data as ApiResponse<T>;
          if (response.code === 0) {
            resolve(response.data as T);
          } else {
            wx.showToast({
              title: response.message || '请求失败',
              icon: 'none',
            });
            reject(new Error(response.message));
          }
        } else {
          wx.showToast({
            title: '网络错误',
            icon: 'none',
          });
          reject(new Error('Network error'));
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '请求失败',
          icon: 'none',
        });
        reject(err);
      },
    });
  });
}

export const api = {
  // 搜索公众号
  searchBiz: (keyword: string) =>
    request<{ list: any[] }>({
      url: `/api/miniapp/search-biz?keyword=${encodeURIComponent(keyword)}`,
    }),

  // 创建订单
  createOrder: (data: { bizName: string; email: string; price?: number }) =>
    request<{
      orderId: string;
      amount: number;
      bizName: string;
      email: string;
      status: string;
    }>({
      url: '/api/miniapp/create-order',
      method: 'POST',
      data,
    }),

  // 支付回调
  paymentCallback: (data: { orderId: string; paymentTime: number }) =>
    request<{ orderId: string; status: string }>({
      url: '/api/miniapp/payment-callback',
      method: 'POST',
      data,
    }),

  // 查询订单状态
  getOrderStatus: (orderId: string) =>
    request<{
      orderId: string;
      bizName: string;
      email: string;
      status: string;
      amount: number;
      createdAt: number;
      completedAt: number | null;
      tasks: Array<{
        id: string;
        type: string;
        status: string;
        progress: number;
        error: string | null;
      }>;
    }>({
      url: `/api/miniapp/order-status?orderId=${orderId}`,
    }),

  // 处理任务（内部调用）
  processTasks: () =>
    request({
      url: '/api/miniapp/process-tasks',
      method: 'POST',
    }),
};