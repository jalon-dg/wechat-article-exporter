"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_log_1 = __importDefault(require("electron-log"));
const net_1 = __importDefault(require("net"));
const node_child_process_1 = require("node:child_process");
// __dirname is available in CommonJS, but since we're using ESM modules we need to define it
// But since tsc compiles to CommonJS (NodeNext), __dirname should work directly
// Let's just use it directly
// Initialize logging
electron_log_1.default.transports.file.level = 'info';
electron_log_1.default.transports.console.level = 'debug';
electron_log_1.default.info('Application starting...');
// Handle uncaught exceptions
process.on('uncaughtException', error => {
    electron_log_1.default.error('Uncaught exception:', error);
    electron_1.app.exit(1);
});
process.on('unhandledRejection', reason => {
    electron_log_1.default.error('Unhandled rejection:', reason);
});
// Global references to prevent garbage collection
let mainWindow = null;
let tray = null;
let isQuitting = false;
let webServer = null;
// Window state storage
const windowStateFile = path_1.default.join(electron_1.app.getPath('userData'), 'window-state.json');
function loadWindowState() {
    try {
        if (fs_1.default.existsSync(windowStateFile)) {
            const data = fs_1.default.readFileSync(windowStateFile, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        electron_log_1.default.error('Failed to load window state:', error);
    }
    return { width: 1200, height: 800, isMaximized: false };
}
function saveWindowState() {
    if (!mainWindow)
        return;
    try {
        const bounds = mainWindow.getBounds();
        const state = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: mainWindow.isMaximized(),
        };
        fs_1.default.writeFileSync(windowStateFile, JSON.stringify(state, null, 2));
    }
    catch (error) {
        electron_log_1.default.error('Failed to save window state:', error);
    }
}
function createWindow() {
    const windowState = loadWindowState();
    mainWindow = new electron_1.BrowserWindow({
        width: windowState.width,
        height: windowState.height,
        x: windowState.x,
        y: windowState.y,
        minWidth: 800,
        minHeight: 600,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path_1.default.join(__dirname, 'assets/logo.svg'),
        title: '微信文章导出器',
    });
    // Restore maximized state
    if (windowState.isMaximized) {
        mainWindow.maximize();
    }
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        electron_log_1.default.info('Window ready to show');
    });
    // Handle close to tray
    mainWindow.on('close', event => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
            electron_log_1.default.info('Window hidden to tray');
        }
        else {
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
    }
    else {
        startWebServer()
            .then(url => mainWindow?.loadURL(url))
            .catch(err => {
            electron_log_1.default.error('Failed to start web server:', err);
            electron_1.dialog.showErrorBox('启动失败', `无法启动内置服务：${String(err)}`);
            electron_1.app.exit(1);
        });
    }
    electron_log_1.default.info('Main window created');
}
function waitForPort(host, port, timeoutMs) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            const socket = new net_1.default.Socket();
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
async function startWebServer() {
    if (webServer)
        return 'http://127.0.0.1:3000';
    const port = Number(process.env.PORT || 38765);
    const host = '127.0.0.1';
    const appPath = electron_1.app.getAppPath();
    const serverEntry = path_1.default.join(appPath, 'apps/web/.output/server/index.mjs');
    webServer = (0, node_child_process_1.spawn)(process.execPath, [serverEntry], {
        stdio: 'pipe',
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
            HOST: host,
            PORT: String(port),
        },
    });
    webServer.stdout?.on('data', buf => electron_log_1.default.info(`[web] ${String(buf).trimEnd()}`));
    webServer.stderr?.on('data', buf => electron_log_1.default.error(`[web] ${String(buf).trimEnd()}`));
    webServer.on('exit', (code, signal) => {
        electron_log_1.default.error(`Web server exited: code=${code} signal=${signal}`);
    });
    await waitForPort(host, port, 15_000);
    return `http://${host}:${port}`;
}
function createTray() {
    const iconPath = path_1.default.join(__dirname, 'assets/logo.svg');
    let trayIcon;
    try {
        trayIcon = electron_1.nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            // Create a simple default icon if SVG fails
            trayIcon = electron_1.nativeImage.createEmpty();
        }
    }
    catch {
        trayIcon = electron_1.nativeImage.createEmpty();
    }
    tray = new electron_1.Tray(trayIcon);
    tray.setToolTip('微信文章导出器');
    const contextMenu = electron_1.Menu.buildFromTemplate([
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
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    electron_log_1.default.info('Tray created');
}
function createMenu() {
    const template = [
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
                        electron_1.app.quit();
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
                        electron_1.dialog.showMessageBox({
                            type: 'info',
                            title: '关于',
                            message: '微信文章导出器',
                            detail: `版本: ${electron_1.app.getVersion()}\n一款方便导出微信公众号文章的桌面工具`,
                        });
                    },
                },
                { type: 'separator' },
                {
                    label: '问题反馈',
                    click: () => {
                        electron_1.shell.openExternal('https://github.com/wechat-article-exporter/wechat-article-exporter/issues');
                    },
                },
            ],
        },
    ];
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
    electron_log_1.default.info('Application menu created');
}
// IPC Handlers
function setupIpcHandlers() {
    // Show save dialog
    electron_1.ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
        electron_log_1.default.info('Show save dialog:', options);
        return electron_1.dialog.showSaveDialog(mainWindow, options);
    });
    // Show open dialog
    electron_1.ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
        electron_log_1.default.info('Show open dialog:', options);
        return electron_1.dialog.showOpenDialog(mainWindow, options);
    });
    // Write file
    electron_1.ipcMain.handle('fs:writeFile', async (_, filePath, data) => {
        electron_log_1.default.info('Writing file:', filePath);
        try {
            fs_1.default.writeFileSync(filePath, Buffer.from(data));
            return { success: true };
        }
        catch (error) {
            electron_log_1.default.error('Failed to write file:', error);
            return { success: false, error: error.message };
        }
    });
    // Write file from blob data
    electron_1.ipcMain.handle('fs:writeFileFromBlob', async (_, filePath, base64Data, mimeType) => {
        electron_log_1.default.info('Writing file from blob:', filePath);
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            fs_1.default.writeFileSync(filePath, buffer);
            return { success: true };
        }
        catch (error) {
            electron_log_1.default.error('Failed to write file:', error);
            return { success: false, error: error.message };
        }
    });
    // Ensure directory exists
    electron_1.ipcMain.handle('fs:ensureDir', async (_, dirPath) => {
        electron_log_1.default.info('Ensuring directory:', dirPath);
        try {
            if (!fs_1.default.existsSync(dirPath)) {
                fs_1.default.mkdirSync(dirPath, { recursive: true });
            }
            return { success: true };
        }
        catch (error) {
            electron_log_1.default.error('Failed to create directory:', error);
            return { success: false, error: error.message };
        }
    });
    // Get app path
    electron_1.ipcMain.handle('app:getPath', (_, name) => {
        return electron_1.app.getPath(name);
    });
    // Get app version
    electron_1.ipcMain.handle('app:getVersion', () => {
        return electron_1.app.getVersion();
    });
    // Minimize to tray
    electron_1.ipcMain.handle('window:minimizeToTray', () => {
        mainWindow?.hide();
        return { success: true };
    });
    // Show notification
    electron_1.ipcMain.handle('notification:show', (_, title, body) => {
        new electron_1.Notification({ title, body }).show();
        return { success: true };
    });
    electron_log_1.default.info('IPC handlers registered');
}
// App lifecycle
electron_1.app.whenReady().then(() => {
    electron_log_1.default.info('App ready');
    setupIpcHandlers();
    createWindow();
    createTray();
    createMenu();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        else {
            mainWindow?.show();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    isQuitting = true;
    saveWindowState();
    electron_log_1.default.info('Application quitting');
    if (webServer && !webServer.killed) {
        try {
            webServer.kill();
        }
        catch (e) {
            electron_log_1.default.error('Failed to kill web server:', e);
        }
    }
});
electron_log_1.default.info('Main process initialized');
//# sourceMappingURL=main.js.map