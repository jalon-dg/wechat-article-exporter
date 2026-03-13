const api = require('../../api/request.js');

Page({
  data: {
    bizList: [],
    loading: false,
    refreshing: false,
    userId: '', // 应该从登录态获取
  },

  onLoad() {
    // TODO: 从登录态获取 userId
    this.setData({ userId: 'test-user-001' });
    this.loadBizList();
  },

  onShow() {
    this.loadBizList();
  },

  onPullDownRefresh() {
    this.loadBizList();
  },

  async loadBizList() {
    const userId = this.data.userId;
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    console.log('[MyBiz] Loading biz list for user:', userId);
    try {
      const result = await api.getUserBizList(userId);
      console.log('[MyBiz] Loaded:', result.list?.length || 0, 'bizs');
      this.setData({
        bizList: result.list || [],
        loading: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
    wx.stopPullDownRefresh();
  },

  formatDate(timestamp) {
    if (!timestamp) return '从未同步';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  onBizClick(e) {
    const { id, bizname } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/my-biz-detail/my-biz-detail?id=${id}&bizName=${encodeURIComponent(bizname)}`,
    });
  },

  onSyncClick(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[MyBiz] Sync biz:', id);
    wx.showLoading({ title: '正在同步...' });

    api.syncUserBiz(id)
      .then(result => {
        wx.hideLoading();
        if (result.code === 0) {
          wx.showToast({ title: '同步任务已创建', icon: 'success' });
          // 轮询任务状态
          this.pollTaskStatus(result.data.taskId);
        } else {
          wx.showToast({ title: result.message || '同步失败', icon: 'none' });
        }
      })
      .catch(e => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: '同步失败', icon: 'none' });
      });
  },

  pollTaskStatus(taskId) {
    let pollCount = 0;
    const maxPolls = 30; // 最多30次

    const poll = () => {
      if (pollCount >= maxPolls) {
        wx.hideLoading();
        return;
      }

      pollCount++;
      api.getUserBizTask(taskId)
        .then(result => {
          if (result.task) {
            const task = result.task;
            if (task.status === 'completed') {
              wx.hideLoading();
              wx.showToast({ title: '同步完成', icon: 'success' });
              this.loadBizList();
            } else if (task.status === 'failed') {
              wx.hideLoading();
              wx.showToast({ title: task.error || '同步失败', icon: 'none' });
            } else {
              // 继续轮询
              setTimeout(poll, 2000);
            }
          }
        })
        .catch(e => {
          console.error(e);
          setTimeout(poll, 2000);
        });
    };

    setTimeout(poll, 1000);
  },

  onExportClick(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[MyBiz] Export biz:', id);
    wx.showLoading({ title: '正在导出...' });

    api.exportUserBiz(id)
      .then(result => {
        wx.hideLoading();
        if (result.code === 0) {
          wx.showToast({ title: '导出任务已创建', icon: 'success' });
          // 轮询任务状态
          this.pollExportTaskStatus(result.data.taskId);
        } else {
          wx.showToast({ title: result.message || '导出失败', icon: 'none' });
        }
      })
      .catch(e => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: '导出失败', icon: 'none' });
      });
  },

  pollExportTaskStatus(taskId) {
    let pollCount = 0;
    const maxPolls = 60; // 导出可能更久

    const poll = () => {
      if (pollCount >= maxPolls) {
        wx.hideLoading();
        return;
      }

      pollCount++;
      api.getUserBizTask(taskId)
        .then(result => {
          if (result.task) {
            const task = result.task;
            if (task.status === 'completed') {
              wx.hideLoading();
              wx.showToast({ title: '导出完成，邮件已发送', icon: 'success' });
              this.loadBizList();
            } else if (task.status === 'failed') {
              wx.hideLoading();
              wx.showToast({ title: task.error || '导出失败', icon: 'none' });
            } else {
              // 继续轮询
              setTimeout(poll, 3000);
            }
          }
        })
        .catch(e => {
          console.error(e);
          setTimeout(poll, 3000);
        });
    };

    setTimeout(poll, 1000);
  },
});