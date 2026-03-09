// Type declarations for the electron API exposed via preload
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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// Needed for TypeScript to recognize this as a module
export {};

export default defineNuxtPlugin(() => {
  if (process.client && window.electronAPI) {
    console.log('Running in Electron environment');
  }
});