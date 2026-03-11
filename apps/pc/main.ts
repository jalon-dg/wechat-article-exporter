import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell, Notification, NativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import net from 'net';
import { spawn, type ChildProcess } from 'node:child_process';

// __dirname is available in CommonJS, but since we're using ESM modules we need to define it
// But since tsc compiles to CommonJS (NodeNext), __dirname should work directly
// Let's just use it directly

// Initialize logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Application starting...');

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  log.error('Uncaught exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', reason => {
  log.error('Unhandled rejection:', reason);
});

// Global references to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let webServer: ChildProcess | null = null;

// Window state storage
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = fs.readFileSync(windowStateFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    log.error('Failed to load window state:', error);
  }
  return { width: 1200, height: 800, isMaximized: false };
}

function saveWindowState(): void {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized(),
    };
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    log.error('Failed to save window state:', error);
  }
}

function createWindow(): void {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, 'assets/logo.svg'),
    title: '微信文章导出器',
  });

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log.info('Window ready to show');
  });

  // Handle close to tray
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      log.info('Window hidden to tray');
    } else {
      saveWindowState();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    startWebServer()
      .then(url => mainWindow?.loadURL(url))
      .catch(err => {
        log.error('Failed to start web server:', err);
        dialog.showErrorBox('启动失败', `无法启动内置服务：${String(err)}`);
        app.exit(1);
      });
  }

  log.info('Main window created');
}

function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('timeout', () => socket.destroy());
      socket.once('error', () => socket.destroy());
      socket.once('close', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryOnce, 250);
      });

      socket.connect(port, host);
    };

    tryOnce();
  });
}

async function startWebServer(): Promise<string> {
  if (webServer) return 'http://127.0.0.1:3000';

  const port = Number(process.env.PORT || 38765);
  const host = '127.0.0.1';
  const appPath = app.getAppPath();
  const serverEntry = path.join(appPath, 'apps/web/.output/server/index.mjs');

  webServer = spawn(process.execPath, [serverEntry], {
    stdio: 'pipe',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: host,
      PORT: String(port),
    },
  });

  webServer.stdout?.on('data', buf => log.info(`[web] ${String(buf).trimEnd()}`));
  webServer.stderr?.on('data', buf => log.error(`[web] ${String(buf).trimEnd()}`));
  webServer.on('exit', (code, signal) => {
    log.error(`Web server exited: code=${code} signal=${signal}`);
  });

  await waitForPort(host, port, 15_000);
  return `http://${host}:${port}`;
}

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets/logo.svg');
  let trayIcon: NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // Create a simple default icon if SVG fails
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('微信文章导出器');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  log.info('Tray created');
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '导出设置',
          click: () => {
            mainWindow?.webContents.send('menu:export-settings');
          },
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制刷新', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于',
              message: '微信文章导出器',
              detail: `版本: ${app.getVersion()}\n一款方便导出微信公众号文章的桌面工具`,
            });
          },
        },
        { type: 'separator' },
        {
          label: '问题反馈',
          click: () => {
            shell.openExternal('https://github.com/wechat-article-exporter/wechat-article-exporter/issues');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  log.info('Application menu created');
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Show save dialog
  ipcMain.handle('dialog:showSaveDialog', async (_, options: Electron.SaveDialogOptions) => {
    log.info('Show save dialog:', options);
    return dialog.showSaveDialog(mainWindow!, options);
  });

  // Show open dialog
  ipcMain.handle('dialog:showOpenDialog', async (_, options: Electron.OpenDialogOptions) => {
    log.info('Show open dialog:', options);
    return dialog.showOpenDialog(mainWindow!, options);
  });

  // Write file
  ipcMain.handle('fs:writeFile', async (_, filePath: string, data: ArrayBuffer | string) => {
    log.info('Writing file:', filePath);
    try {
      fs.writeFileSync(filePath, Buffer.from(data as ArrayBuffer));
      return { success: true };
    } catch (error) {
      log.error('Failed to write file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Write file from blob data
  ipcMain.handle('fs:writeFileFromBlob', async (_, filePath: string, base64Data: string, mimeType: string) => {
    log.info('Writing file from blob:', filePath);
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      return { success: true };
    } catch (error) {
      log.error('Failed to write file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Ensure directory exists
  ipcMain.handle('fs:ensureDir', async (_, dirPath: string) => {
    log.info('Ensuring directory:', dirPath);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return { success: true };
    } catch (error) {
      log.error('Failed to create directory:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get app path
  ipcMain.handle('app:getPath', (_, name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads' | 'documents') => {
    return app.getPath(name);
  });

  // Get app version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  // Minimize to tray
  ipcMain.handle('window:minimizeToTray', () => {
    mainWindow?.hide();
    return { success: true };
  });

  // Show notification
  ipcMain.handle('notification:show', (_, title: string, body: string) => {
    new Notification({ title, body }).show();
    return { success: true };
  });

  log.info('IPC handlers registered');
}

// App lifecycle
app.whenReady().then(() => {
  log.info('App ready');
  setupIpcHandlers();
  createWindow();
  createTray();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowState();
  log.info('Application quitting');
  if (webServer && !webServer.killed) {
    try {
      webServer.kill();
    } catch (e) {
      log.error('Failed to kill web server:', e);
    }
  }
});

log.info('Main process initialized');