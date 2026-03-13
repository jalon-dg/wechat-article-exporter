// 小程序后端API地址
// 开发环境使用 miniapp-server (默认端口3001)，生产环境使用独立服务器
const API_BASE = 'http://127.0.0.1:3001';

function request(options) {
  const { url, method = 'GET', data } = options;
  const fullUrl = url.startsWith('http') ? url : API_BASE + url;
  console.log(`[API] ${method} ${fullUrl}`, data || '');

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
      },
      success: res => {
        console.log(`[API Response] ${res.statusCode}`, res.data);
        if (res.statusCode === 200) {
          const response = res.data;
          if (response.code === 0) {
            console.log(`[API Success]`, response.data);
            resolve(response.data);
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
      fail: err => {
        console.error(`[API Error]`, err);
        wx.showToast({
          title: '请求失败',
          icon: 'none',
        });
        reject(err);
      },
    });
  });
}

module.exports = {
  searchBiz: keyword =>
    request({
      url: `/api/miniapp/search-biz?keyword=${encodeURIComponent(keyword)}`,
    }),

  createOrder: data =>
    request({
      url: '/api/miniapp/create-order',
      method: 'POST',
      data,
    }),

  paymentCallback: data =>
    request({
      url: '/api/miniapp/payment-callback',
      method: 'POST',
      data,
    }),

  getOrderStatus: orderId =>
    request({
      url: `/api/miniapp/order-status?orderId=${orderId}`,
    }),

  getOrders: () =>
    request({
      url: '/api/miniapp/orders',
    }),

  processTasks: () =>
    request({
      url: '/api/miniapp/process-tasks',
      method: 'POST',
    }),

  // 用户公众号相关API
  getUserBizList: userId =>
    request({
      url: `/api/miniapp/user-biz-list?userId=${encodeURIComponent(userId)}`,
    }),

  getUserBizDetail: id =>
    request({
      url: `/api/miniapp/user-biz-detail?id=${encodeURIComponent(id)}`,
    }),

  syncUserBiz: userBizId =>
    request({
      url: '/api/miniapp/user-biz-sync',
      method: 'POST',
      data: { userBizId },
    }),

  exportUserBiz: userBizId =>
    request({
      url: '/api/miniapp/user-biz-export',
      method: 'POST',
      data: { userBizId },
    }),

  getUserBizTask: taskId =>
    request({
      url: `/api/miniapp/user-biz-task?taskId=${encodeURIComponent(taskId)}`,
    }),
};
