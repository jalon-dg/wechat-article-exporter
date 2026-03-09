import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
export interface ElectronAPI {
  // Dialog APIs
  showSaveDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<{ canceled: boolean; filePath?: string }>;

  showOpenDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;

  // File system APIs
  writeFile: (
    filePath: string,
    data: ArrayBuffer | string
  ) => Promise<{ success: boolean; error?: string }>;

  writeFileFromBlob: (
    filePath: string,
    base64Data: string,
    mimeType: string
  ) => Promise<{ success: boolean; error?: string }>;

  ensureDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;

  // App APIs
  getPath: (
    name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads' | 'documents'
  ) => Promise<string>;

  getVersion: () => Promise<string>;

  // Window APIs
  minimizeToTray: () => Promise<{ success: boolean }>;

  // Notification APIs
  showNotification: (title: string, body: string) => Promise<{ success: boolean }>;

  // Event listeners
  onMenuExportSettings: (callback: () => void) => () => void;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // Dialog APIs
  showSaveDialog: options => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: options => ipcRenderer.invoke('dialog:showOpenDialog', options),

  // File system APIs
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  writeFileFromBlob: (filePath, base64Data, mimeType) =>
    ipcRenderer.invoke('fs:writeFileFromBlob', filePath, base64Data, mimeType),
  ensureDir: dirPath => ipcRenderer.invoke('fs:ensureDir', dirPath),

  // App APIs
  getPath: name => ipcRenderer.invoke('app:getPath', name),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Window APIs
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),

  // Notification APIs
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', title, body),

  // Event listeners
  onMenuExportSettings: callback => {
    const handler = () => callback();
    ipcRenderer.on('menu:export-settings', handler);
    return () => ipcRenderer.removeListener('menu:export-settings', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Preload script loaded');