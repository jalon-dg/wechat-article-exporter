const api = require('../../api/request.js');

Page({
  data: {
    bizName: '',
    email: '',
    loading: false,
  },

  onBizNameInput(e) {
    this.setData({ bizName: e.detail.value });
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value });
  },

  async handleSubmit() {
    const { bizName, email } = this.data;

    if (!bizName.trim()) {
      wx.showToast({ title: '请输入公众号名称', icon: 'none' });
      return;
    }
    if (!email.trim()) {
      wx.showToast({ title: '请输入邮箱', icon: 'none' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      wx.showToast({ title: '请输入有效的邮箱', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 创建订单
      const order = await api.createOrder({
        bizName,
        email,
        price: 500,
      });

      wx.showToast({ title: '订单创建成功', icon: 'success' });

      // 跳转到订单页面
      wx.navigateTo({
        url: `/pages/order/order?orderId=${order.orderId}&amount=${order.amount}&bizName=${encodeURIComponent(bizName)}`,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },
});