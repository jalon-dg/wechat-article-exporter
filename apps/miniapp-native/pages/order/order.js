const api = require('../../api/request.js');

Page({
  data: {
    orderId: '',
    amount: 0,
    bizName: '',
    status: 'pending',
    tasks: [],
    loading: false,
    pollingTimer: null,
  },

  onUnload() {
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({
        orderId: options.orderId || '',
        amount: Number(options.amount) || 0,
        bizName: decodeURIComponent(options.bizName || ''),
      });
    }
  },

  onShow() {
    if (this.data.orderId) {
      this.pollStatus();
    }
  },

  async pollStatus() {
    // 清除之前的定时器
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
      this.setData({ pollingTimer: null });
    }

    const doPoll = async () => {
      try {
        const result = await api.getOrderStatus(this.data.orderId);
        this.setData({
          status: result.status,
          tasks: result.tasks,
        });

        if (result.status === 'completed') {
          wx.showToast({ title: '订单已完成！请查收邮箱', icon: 'success' });
          if (this.data.pollingTimer) {
            clearInterval(this.data.pollingTimer);
            this.setData({ pollingTimer: null });
          }
        } else if (result.status === 'failed') {
          wx.showToast({ title: '订单处理失败', icon: 'none' });
          if (this.data.pollingTimer) {
            clearInterval(this.data.pollingTimer);
            this.setData({ pollingTimer: null });
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    // 立即执行一次
    await doPoll();

    // 如果未完成，设置定时轮询（每3秒）
    if (this.data.status !== 'completed' && this.data.status !== 'failed') {
      const timer = setInterval(doPoll, 3000);
      this.setData({ pollingTimer: timer });
    }
  },

  async handlePay() {
    this.setData({ loading: true });
    try {
      await api.paymentCallback({
        orderId: this.data.orderId,
        paymentTime: Date.now(),
      });
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.pollStatus();
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
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

  getTaskName(type) {
    const map = {
      fetch_articles: '抓取文章',
      generate_ebook: '生成电子书',
      send_email: '发送邮件',
    };
    return map[type] || type;
  },
});