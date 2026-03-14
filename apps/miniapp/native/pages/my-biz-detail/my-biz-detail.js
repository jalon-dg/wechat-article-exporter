const api = require('../../api/request.js');

Page({
  data: {
    biz: null,
    tasks: [],
    loading: false,
    id: '',
  },

  onLoad(options) {
    const { id, bizName } = options;
    this.setData({ id });
    if (bizName) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(bizName) });
    }
    this.loadBizDetail();
  },

  async loadBizDetail() {
    const { id } = this.data;
    if (!id) return;

    this.setData({ loading: true });
    console.log('[MyBizDetail] Loading biz detail:', id);
    try {
      const result = await api.getUserBizDetail(id);
      console.log('[MyBizDetail] Loaded:', result);
      this.setData({
        biz: result.biz,
        tasks: result.tasks || [],
        loading: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
  },

  formatDate(timestamp) {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  getTaskTypeText(type) {
    const map = {
      sync_articles: '同步文章',
      generate_epub: '导出EPUB',
      send_email: '发送邮件',
    };
    return map[type] || type;
  },

  getTaskStatusText(status) {
    const map = {
      pending: '等待中',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  },

  getTaskStatusColor(status) {
    const map = {
      pending: '#ff976a',
      processing: '#1989fa',
      completed: '#07c160',
      failed: '#ee0a24',
    };
    return map[status] || '#323233';
  },

  onSyncClick() {
    const { id } = this.data;
    console.log('[MyBizDetail] Sync biz:', id);
    wx.showLoading({ title: '正在同步...' });

    api
      .syncUserBiz(id)
      .then(result => {
        wx.hideLoading();
        if (result.code === 0) {
          wx.showToast({ title: '同步任务已创建', icon: 'success' });
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

  onExportClick() {
    const { id } = this.data;
    console.log('[MyBizDetail] Export biz:', id);
    wx.showLoading({ title: '正在导出...' });

    api
      .exportUserBiz(id)
      .then(result => {
        wx.hideLoading();
        if (result.code === 0) {
          wx.showToast({ title: '导出任务已创建', icon: 'success' });
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

  pollTaskStatus(taskId) {
    let pollCount = 0;
    const maxPolls = 30;

    const poll = () => {
      if (pollCount >= maxPolls) {
        wx.hideLoading();
        return;
      }

      pollCount++;
      api
        .getUserBizTask(taskId)
        .then(result => {
          if (result.task) {
            const task = result.task;
            if (task.status === 'completed') {
              wx.hideLoading();
              wx.showToast({ title: '同步完成', icon: 'success' });
              this.loadBizDetail();
            } else if (task.status === 'failed') {
              wx.hideLoading();
              wx.showToast({ title: task.error || '同步失败', icon: 'none' });
            } else {
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

  pollExportTaskStatus(taskId) {
    let pollCount = 0;
    const maxPolls = 60;

    const poll = () => {
      if (pollCount >= maxPolls) {
        wx.hideLoading();
        return;
      }

      pollCount++;
      api
        .getUserBizTask(taskId)
        .then(result => {
          if (result.task) {
            const task = result.task;
            if (task.status === 'completed') {
              wx.hideLoading();
              wx.showToast({ title: '导出完成，邮件已发送', icon: 'success' });
              this.loadBizDetail();
            } else if (task.status === 'failed') {
              wx.hideLoading();
              wx.showToast({ title: task.error || '导出失败', icon: 'none' });
            } else {
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
