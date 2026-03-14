"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
    close: () => electron_1.ipcRenderer.invoke('window:close'),
    startDrag: () => electron_1.ipcRenderer.invoke('window:startDrag'),
    // Dialog
    selectSavePath: () => electron_1.ipcRenderer.invoke('dialog:selectPath'),
    // Database
    getAccount: () => electron_1.ipcRenderer.invoke('db:getAccount'),
    saveAccount: (account) => electron_1.ipcRenderer.invoke('db:saveAccount', account),
    deleteAccount: () => electron_1.ipcRenderer.invoke('db:deleteAccount'),
    getArticlesFromDb: () => electron_1.ipcRenderer.invoke('db:getArticles'),
    saveArticle: (article) => electron_1.ipcRenderer.invoke('db:saveArticle', article),
    clearArticles: () => electron_1.ipcRenderer.invoke('db:clearArticles'),
    getSetting: (key) => electron_1.ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => electron_1.ipcRenderer.invoke('db:setSetting', key, value),
    // WeChat API
    getQrcode: () => electron_1.ipcRenderer.invoke('wechat:getQrcode'),
    checkScan: (uuid) => electron_1.ipcRenderer.invoke('wechat:checkScan', uuid),
    confirmLogin: (cookie) => electron_1.ipcRenderer.invoke('wechat:confirmLogin', cookie),
    searchBiz: (keyword, cookie, token) => electron_1.ipcRenderer.invoke('wechat:searchBiz', keyword, cookie, token),
    getArticles: (fakeid, cookie, token, appmsgToken) => electron_1.ipcRenderer.invoke('wechat:getArticles', fakeid, cookie, token, appmsgToken),
    getArticleDetail: (link, cookie) => electron_1.ipcRenderer.invoke('wechat:getArticleDetail', link, cookie),
    // Export
    saveFile: (filePath, data) => electron_1.ipcRenderer.invoke('export:saveFile', filePath, data),
    // Notification
    showNotification: (title, body) => electron_1.ipcRenderer.invoke('notification:show', title, body),
    // License
    license: {
        getDeviceId: () => electron_1.ipcRenderer.invoke('license:getDeviceId'),
        activate: (code, deviceId) => electron_1.ipcRenderer.invoke('license:activate', code, deviceId),
        validate: (deviceId) => electron_1.ipcRenderer.invoke('license:validate', deviceId),
        logout: (deviceId) => electron_1.ipcRenderer.invoke('license:logout', deviceId),
    },
    // Events
    onCollectProgress: (callback) => {
        electron_1.ipcRenderer.on('collect:progress', (_, progress) => callback(progress));
    },
});
//# sourceMappingURL=preload.js.map