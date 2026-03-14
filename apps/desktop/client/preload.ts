import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  startDrag: () => ipcRenderer.invoke('window:startDrag'),

  // Dialog
  selectSavePath: () => ipcRenderer.invoke('dialog:selectPath'),

  // Database
  getAccount: () => ipcRenderer.invoke('db:getAccount'),
  saveAccount: (account: {
    nickname: string;
    fakeid: string;
    cookie: string;
    token: string;
    appmsg_token?: string;
    weixin_2021_1?: number;
  }) => ipcRenderer.invoke('db:saveAccount', account),
  deleteAccount: () => ipcRenderer.invoke('db:deleteAccount'),

  getArticlesFromDb: () => ipcRenderer.invoke('db:getArticles'),
  saveArticle: (article: {
    account_id: number;
    fakeid: string;
    title: string;
    link: string;
    content?: string;
    author?: string;
    source_url?: string;
    cover_image?: string;
    publish_date?: string;
    read_count?: number;
    like_count?: number;
  }) => ipcRenderer.invoke('db:saveArticle', article),
  clearArticles: () => ipcRenderer.invoke('db:clearArticles'),

  getSetting: (key: string) => ipcRenderer.invoke('db:getSetting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),

  // WeChat API
  getQrcode: () => ipcRenderer.invoke('wechat:getQrcode'),
  checkScan: (uuid: string) => ipcRenderer.invoke('wechat:checkScan', uuid),
  confirmLogin: (cookie: string) => ipcRenderer.invoke('wechat:confirmLogin', cookie),
  searchBiz: (keyword: string, cookie: string, token: string) =>
    ipcRenderer.invoke('wechat:searchBiz', keyword, cookie, token),
  getArticles: (fakeid: string, cookie: string, token: string, appmsgToken: string) =>
    ipcRenderer.invoke('wechat:getArticles', fakeid, cookie, token, appmsgToken),
  getArticleDetail: (link: string, cookie: string) => ipcRenderer.invoke('wechat:getArticleDetail', link, cookie),

  // Export
  saveFile: (filePath: string, data: string) => ipcRenderer.invoke('export:saveFile', filePath, data),

  // Notification
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),

  // License
  license: {
    getDeviceId: () => ipcRenderer.invoke('license:getDeviceId'),
    activate: (code: string, deviceId: string) => ipcRenderer.invoke('license:activate', code, deviceId),
    validate: (deviceId: string) => ipcRenderer.invoke('license:validate', deviceId),
    logout: (deviceId: string) => ipcRenderer.invoke('license:logout', deviceId),
  },

  // Events
  onCollectProgress: (callback: (progress: { current: number; total: number; currentTitle: string }) => void) => {
    ipcRenderer.on('collect:progress', (_, progress) => callback(progress));
  },
});
