const API_BASE = 'http://10.191.116.72:3000';

function request(options) {
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
      success: res => {
        if (res.statusCode === 200) {
          const response = res.data;
          if (response.code === 0) {
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
};
