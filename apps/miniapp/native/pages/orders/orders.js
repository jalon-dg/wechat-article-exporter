const api = require('../../api/request.js');

Page({
  data: {
    orders: [],
    loading: false,
    refreshing: false,
  },

  onLoad() {
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    console.log('[Orders] Loading orders...');
    try {
      const result = await api.getOrders();
      console.log('[Orders] Loaded:', result.list?.length || 0, 'orders');
      this.setData({
        orders: result.list || [],
        loading: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
    wx.stopPullDownRefresh();
  },

  getStatusText(status) {
    const map = {
      pending: '待支付',
      paid: '已支付',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  },

  getStatusColor(status) {
    const map = {
      pending: '#ff976a',
      paid: '#1989fa',
      processing: '#1989fa',
      completed: '#07c160',
      failed: '#ee0a24',
    };
    return map[status] || '#323233';
  },

  formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  onOrderClick(e) {
    const { orderid, bizname, amount, status } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/order/order?orderId=${orderid}&amount=${amount}&bizName=${encodeURIComponent(bizname)}`,
    });
  },
});
