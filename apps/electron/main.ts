import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import axios from 'axios';
import Database from 'better-sqlite3';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Application starting...');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

// Global references
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let db: Database.Database | null = null;

const isDev = process.argv.includes('--dev');

// Database path
const dbPath = path.join(app.getPath('userData'), 'wechat-exporter.db');

function initDatabase(): void {
  try {
    db = new Database(dbPath);
    log.info('Database opened:', dbPath);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT,
        fakeid TEXT UNIQUE,
        cookie TEXT NOT NULL,
        token TEXT NOT NULL,
        appmsg_token TEXT,
        weixin_2021_1 INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER,
        fakeid TEXT,
        title TEXT NOT NULL,
        link TEXT UNIQUE,
        content TEXT,
        author TEXT,
        source_url TEXT,
        cover_image TEXT,
        publish_date DATETIME,
        read_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Insert default settings if not exist
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('export_path', '');
    insertSetting.run('concurrency', '3');
    insertSetting.run('auto_login', 'true');

    log.info('Database initialized');
  } catch (error) {
    log.error('Failed to initialize database:', error);
    throw error;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets/logo.svg')
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log.info('Window ready to show');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  if (isDev) {
    const preferredDevUrl =
      process.env.ELECTRON_DEV_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    const viteFallbackDevUrl = 'http://localhost:5173';
    const nuxtPortFallbackRange = { start: 3000, end: 3010 };

    const hasExplicitDevUrl = Boolean(process.env.ELECTRON_DEV_URL || process.env.VITE_DEV_SERVER_URL);
    const tryQueue: string[] = [];
    const enqueue = (url: string) => {
      if (!tryQueue.includes(url)) tryQueue.push(url);
    };

    enqueue(preferredDevUrl);
    if (!hasExplicitDevUrl) {
      // Nuxt dev server may auto-pick 3001+ if 3000 is taken.
      for (let port = nuxtPortFallbackRange.start; port <= nuxtPortFallbackRange.end; port++) {
        enqueue(`http://localhost:${port}`);
      }
      // Some workflows use Vite dev server.
      enqueue(viteFallbackDevUrl);
    }

    let currentUrl = tryQueue.shift()!;
    let lastError: string | undefined;
    const tryNext = (reason?: string) => {
      if (hasExplicitDevUrl) return;
      if (reason) lastError = reason;
      const next = tryQueue.shift();
      if (!next) {
        log.error(
          `All dev URLs failed. Last error: ${lastError || 'unknown'}. ` +
            `Set ELECTRON_DEV_URL to override (e.g. http://localhost:3001).`,
        );
        return;
      }
      currentUrl = next;
      log.warn(`Dev URL failed, trying ${currentUrl}${reason ? ` (reason: ${reason})` : ''}`);
      mainWindow?.loadURL(currentUrl).catch((err) => {
        tryNext((err as Error)?.message);
      });
    };

    mainWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL) => {
      if (validatedURL === currentUrl && /ERR_CONNECTION_REFUSED/i.test(errorDescription)) tryNext(errorDescription);
    });

    mainWindow.loadURL(currentUrl).catch((err) => {
      tryNext((err as Error)?.message);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  log.info('Main window created');
}

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets/logo.svg');
  let trayIcon: Electron.NativeImage;

  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      // Create a simple 16x16 icon
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
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  log.info('Tray created');
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('window:startDrag', () => {
    // This is handled in renderer via -webkit-app-region: drag
  });

  // Dialog
  ipcMain.handle('dialog:selectPath', async () => {
    const result = await dialog.showSaveDialog({
      title: '保存电子书',
      defaultPath: '微信文章精选.epub',
      filters: [
        { name: 'EPUB', extensions: ['epub'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Word', extensions: ['docx'] }
      ]
    });
    return result.filePath;
  });

  // Database operations
  ipcMain.handle('db:getAccount', () => {
    if (!db) return null;
    const stmt = db.prepare('SELECT * FROM accounts LIMIT 1');
    return stmt.get();
  });

  ipcMain.handle('db:saveAccount', (_, account: {
    nickname: string;
    fakeid: string;
    cookie: string;
    token: string;
    appmsg_token?: string;
    weixin_2021_1?: number;
  }) => {
    if (!db) return null;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO accounts (nickname, fakeid, cookie, token, appmsg_token, weixin_2021_1, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(
      account.nickname,
      account.fakeid,
      account.cookie,
      account.token,
      account.appmsg_token || '',
      account.weixin_2021_1 || 0
    );
    return result;
  });

  ipcMain.handle('db:deleteAccount', () => {
    if (!db) return null;
    const stmt = db.prepare('DELETE FROM accounts');
    stmt.run();
  });

  ipcMain.handle('db:getArticles', () => {
    if (!db) return [];
    const stmt = db.prepare('SELECT * FROM articles ORDER BY publish_date DESC');
    return stmt.all();
  });

  ipcMain.handle('db:saveArticle', (_, article: {
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
  }) => {
    if (!db) return null;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO articles (account_id, fakeid, title, link, content, author, source_url, cover_image, publish_date, read_count, like_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      article.account_id,
      article.fakeid,
      article.title,
      article.link,
      article.content || '',
      article.author || '',
      article.source_url || '',
      article.cover_image || '',
      article.publish_date || '',
      article.read_count || 0,
      article.like_count || 0
    );
  });

  ipcMain.handle('db:clearArticles', () => {
    if (!db) return null;
    const stmt = db.prepare('DELETE FROM articles');
    return stmt.run();
  });

  ipcMain.handle('db:getSetting', (_, key: string) => {
    if (!db) return null;
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value;
  });

  ipcMain.handle('db:setSetting', (_, key: string, value: string) => {
    if (!db) return null;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    return stmt.run(key, value);
  });

  // WeChat API calls (in main process to avoid CORS)
  ipcMain.handle('wechat:getQrcode', async () => {
    try {
      const response = await axios.get('https://mp.weixin.qq.com/cgi-bin/loginqrcode', {
        params: {
          action: 'getqrcode',
          random: Math.random()
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to get qrcode:', error);
      throw error;
    }
  });

  ipcMain.handle('wechat:checkScan', async (_, uuid: string) => {
    try {
      const response = await axios.get('https://mp.weixin.qq.com/cgi-bin/loginqrcode', {
        params: {
          action: 'ask',
          login_side: 'https://mp.weixin.qq.com/cgi-bin/home',
          token: '',
          lang: 'zh_CN',
          f: 'json',
          ajax: 1,
          uuid
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to check scan:', error);
      throw error;
    }
  });

  ipcMain.handle('wechat:confirmLogin', async (_, cookie: string) => {
    try {
      const response = await axios.get('https://mp.weixin.qq.com/cgi-bin/home', {
        params: {
          action: 'home',
          lang: 'zh_CN',
          token: ''
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to confirm login:', error);
      throw error;
    }
  });

  ipcMain.handle('wechat:searchBiz', async (_, keyword: string, cookie: string, token: string) => {
    try {
      const response = await axios.get('https://mp.weixin.qq.com/cgi-bin/searchbiz', {
        params: {
          action: 'search_biz',
          fakeid: '',
          keyword,
          token,
          lang: 'zh_CN',
          f: 'json',
          ajax: 1
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to search biz:', error);
      throw error;
    }
  });

  ipcMain.handle('wechat:getArticles', async (_, fakeid: string, cookie: string, token: string, appmsgToken: string) => {
    try {
      const response = await axios.get('https://mp.weixin.qq.com/cgi-bin/appmsgpublish', {
        params: {
          action: 'list',
          fakeid,
          token,
          lang: 'zh_CN',
          f: 'json',
          ajax: 1,
          appmsg_token: appmsgToken,
          weixin_2021_1: 1
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to get articles:', error);
      throw error;
    }
  });

  ipcMain.handle('wechat:getArticleDetail', async (_, link: string, cookie: string) => {
    try {
      const response = await axios.get(link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie
        }
      });
      return response.data;
    } catch (error) {
      log.error('Failed to get article detail:', error);
      throw error;
    }
  });

  // Export
  ipcMain.handle('export:saveFile', async (_, filePath: string, data: string) => {
    try {
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      return { success: true };
    } catch (error) {
      log.error('Failed to save file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Notification
  ipcMain.handle('notification:show', (_, title: string, body: string) => {
    const { Notification } = require('electron');
    new Notification({ title, body }).show();
  });

  log.info('IPC handlers registered');
}

// App lifecycle
app.whenReady().then(() => {
  log.info('App ready');

  initDatabase();
  setupIpcHandlers();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('Application quitting');
  if (db) {
    db.close();
    log.info('Database closed');
  }
});

log.info('Main process initialized');