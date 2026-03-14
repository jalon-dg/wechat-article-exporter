"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI = {
    // Dialog APIs
    showSaveDialog: options => electron_1.ipcRenderer.invoke('dialog:showSaveDialog', options),
    showOpenDialog: options => electron_1.ipcRenderer.invoke('dialog:showOpenDialog', options),
    // File system APIs
    writeFile: (filePath, data) => electron_1.ipcRenderer.invoke('fs:writeFile', filePath, data),
    writeFileFromBlob: (filePath, base64Data, mimeType) => electron_1.ipcRenderer.invoke('fs:writeFileFromBlob', filePath, base64Data, mimeType),
    ensureDir: dirPath => electron_1.ipcRenderer.invoke('fs:ensureDir', dirPath),
    // App APIs
    getPath: name => electron_1.ipcRenderer.invoke('app:getPath', name),
    getVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    // Window APIs
    minimizeToTray: () => electron_1.ipcRenderer.invoke('window:minimizeToTray'),
    // Notification APIs
    showNotification: (title, body) => electron_1.ipcRenderer.invoke('notification:show', title, body),
    // Event listeners
    onMenuExportSettings: callback => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('menu:export-settings', handler);
        return () => electron_1.ipcRenderer.removeListener('menu:export-settings', handler);
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('Preload script loaded');
//# sourceMappingURL=preload.js.map