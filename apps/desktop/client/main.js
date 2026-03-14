"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
// Get server URL based on environment
async function getServerUrl() {
    if (isDev) {
        // Desktop 管理端固定 30001；不连 miniapp(3001)
        const desktopServerPort = 30001;
        const webPorts = [3000, 5173]; // web 用户端 3000、desktop client Vite 5173 仅作 fallback
        try {
            await axios_1.default.get(`http://localhost:${desktopServerPort}/admin/api/license/validate?device_id=test`, {
                timeout: 1000,
            });
            return `http://localhost:${desktopServerPort}/admin`;
        }
        catch {
            try {
                await axios_1.default.get(`http://localhost:${desktopServerPort}/api/license/validate?device_id=test`, {
                    timeout: 1000,
                });
                return `http://localhost:${desktopServerPort}`;
            }
            catch {
                // no-op
            }
        }
        for (const port of webPorts) {
            try {
                await axios_1.default.get(`http://localhost:${port}/api/public/v1/account`, { timeout: 1000 });
                return `http://localhost:${port}`;
            }
            catch {
                continue;
            }
        }
        return `http://localhost:${desktopServerPort}`;
    }
    return process.env.LICENSE_SERVER_URL || 'http://localhost:30001';
}
// License API 在 Nitro 根路径 /api/，不在 /admin/ 下，故用 origin
function getLicenseApiBase(serverUrl) {
    return new URL(serverUrl).origin;
}
// Configure logging
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
// Global references
let mainWindow = null;
let tray = null;
const isDev = process.argv.includes('--dev');
// 轻量级本地 DB（sql.js，纯 JS，无需原生模块）
const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'wechat-exporter.db');
let db = null;
function persistDb() {
    if (!db)
        return;
    try {
        const data = db.export();
        fs_1.default.writeFileSync(dbPath, Buffer.from(data));
    }
    catch (e) {
        electron_log_1.default.error('Failed to persist database', e);
    }
}
function rowFromExec(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    if (!stmt.step()) {
        stmt.free();
        return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
}
function rowsFromExec(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step())
        rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}
async function initDatabase() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const data = fs_1.default.existsSync(dbPath) ? fs_1.default.readFileSync(dbPath) : null;
    db = new SQL.Database(data ?? undefined);
    electron_log_1.default.info('Database opened (sql.js):', dbPath);
    if (!data) {
        const database = db;
        database.run(`
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
      CREATE TABLE articles (
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      INSERT OR IGNORE INTO settings (key, value) VALUES ('export_path', '');
      INSERT OR IGNORE INTO settings (key, value) VALUES ('concurrency', '3');
      INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_login', 'true');
    `);
        persistDb();
    }
    electron_log_1.default.info('Database initialized');
}
async function getDeviceId() {
    const deviceInfo = [
        electron_1.app.getPath('home'),
        electron_1.app.getPath('userData'),
        process.platform,
        process.arch,
        os_1.default.hostname(),
    ].join('|');
    return crypto_1.default.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 64);
}
function createWindow() {
    const iconPathPng = path_1.default.join(__dirname, 'assets/logo.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 420,
        height: 600,
        resizable: false,
        frame: false,
        center: true,
        show: false,
        backgroundColor: '#ffffff',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        ...(fs_1.default.existsSync(iconPathPng) ? { icon: iconPathPng } : {}),
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        electron_log_1.default.info('Window ready to show');
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Load the app
    if (isDev) {
        // Desktop client 使用 Vite 5173；不尝试 web/miniapp 端口
        const preferredDevUrl = process.env.ELECTRON_DEV_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
        const viteFallbackDevUrl = 'http://localhost:5173';
        const nuxtPortFallbackRange = { start: 5173, end: 5173 };
        const hasExplicitDevUrl = Boolean(process.env.ELECTRON_DEV_URL || process.env.VITE_DEV_SERVER_URL);
        const tryQueue = [];
        const enqueue = (url) => {
            if (!tryQueue.includes(url))
                tryQueue.push(url);
        };
        enqueue(preferredDevUrl);
        if (!hasExplicitDevUrl) {
            for (let port = nuxtPortFallbackRange.start; port <= nuxtPortFallbackRange.end; port++) {
                enqueue(`http://localhost:${port}`);
            }
            enqueue(viteFallbackDevUrl);
        }
        let currentUrl = tryQueue.shift();
        let lastError;
        const tryNext = (reason) => {
            if (hasExplicitDevUrl)
                return;
            if (reason)
                lastError = reason;
            const next = tryQueue.shift();
            if (!next) {
                electron_log_1.default.error(`All dev URLs failed. Last error: ${lastError || 'unknown'}. ` +
                    `Set ELECTRON_DEV_URL to override (e.g. http://localhost:5173).`);
                return;
            }
            currentUrl = next;
            electron_log_1.default.warn(`Dev URL failed, trying ${currentUrl}${reason ? ` (reason: ${reason})` : ''}`);
            mainWindow?.loadURL(currentUrl).catch(err => {
                tryNext(err?.message);
            });
        };
        mainWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL) => {
            if (validatedURL === currentUrl && /ERR_CONNECTION_REFUSED/i.test(errorDescription))
                tryNext(errorDescription);
        });
        mainWindow.loadURL(currentUrl).catch(err => {
            tryNext(err?.message);
        });
        // 需要调试时再打开：主进程菜单或快捷键，或取消下行注释
        // mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    electron_log_1.default.info('Main window created');
}
function createTray() {
    // macOS 上托盘需 PNG，用 SVG 或空图可能导致崩溃；无有效图标时跳过托盘
    const iconPathPng = path_1.default.join(__dirname, 'assets/logo.png');
    const iconPathSvg = path_1.default.join(__dirname, 'assets/logo.svg');
    let trayIcon = null;
    if (fs_1.default.existsSync(iconPathPng)) {
        trayIcon = electron_1.nativeImage.createFromPath(iconPathPng);
    }
    else if (fs_1.default.existsSync(iconPathSvg)) {
        trayIcon = electron_1.nativeImage.createFromPath(iconPathSvg);
    }
    if (!trayIcon || trayIcon.isEmpty()) {
        electron_log_1.default.info('No valid tray icon, skipping tray');
        return;
    }
    try {
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
    catch (err) {
        electron_log_1.default.warn('Tray creation failed, continuing without tray', err);
        tray = null;
    }
}
// IPC Handlers
function setupIpcHandlers() {
    // Window controls
    electron_1.ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });
    electron_1.ipcMain.handle('window:close', () => {
        mainWindow?.hide();
    });
    electron_1.ipcMain.handle('window:startDrag', () => {
        // This is handled in renderer via -webkit-app-region: drag
    });
    // Dialog
    electron_1.ipcMain.handle('dialog:selectPath', async () => {
        const result = await electron_1.dialog.showSaveDialog({
            title: '保存电子书',
            defaultPath: '微信文章精选.epub',
            filters: [
                { name: 'EPUB', extensions: ['epub'] },
                { name: 'PDF', extensions: ['pdf'] },
                { name: 'Word', extensions: ['docx'] },
            ],
        });
        return result.filePath;
    });
    // Database operations（sql.js，轻量级，无需原生模块）
    electron_1.ipcMain.handle('db:getAccount', () => {
        if (!db)
            return null;
        return rowFromExec(db, 'SELECT * FROM accounts LIMIT 1');
    });
    electron_1.ipcMain.handle('db:saveAccount', (_, account) => {
        if (!db)
            return null;
        db.run(`INSERT OR REPLACE INTO accounts (nickname, fakeid, cookie, token, appmsg_token, weixin_2021_1, updated_at)
         VALUES (:nickname, :fakeid, :cookie, :token, :appmsg_token, :weixin_2021_1, CURRENT_TIMESTAMP)`, {
            ':nickname': account.nickname,
            ':fakeid': account.fakeid,
            ':cookie': account.cookie,
            ':token': account.token,
            ':appmsg_token': account.appmsg_token ?? '',
            ':weixin_2021_1': account.weixin_2021_1 ?? 0,
        });
        persistDb();
        return {};
    });
    electron_1.ipcMain.handle('db:deleteAccount', () => {
        if (!db)
            return null;
        db.run('DELETE FROM accounts');
        persistDb();
        return {};
    });
    electron_1.ipcMain.handle('db:getArticles', () => {
        if (!db)
            return [];
        return rowsFromExec(db, 'SELECT * FROM articles ORDER BY publish_date DESC');
    });
    electron_1.ipcMain.handle('db:saveArticle', (_, article) => {
        if (!db)
            return null;
        db.run(`INSERT OR REPLACE INTO articles (account_id, fakeid, title, link, content, author, source_url, cover_image, publish_date, read_count, like_count)
         VALUES (:account_id, :fakeid, :title, :link, :content, :author, :source_url, :cover_image, :publish_date, :read_count, :like_count)`, {
            ':account_id': article.account_id,
            ':fakeid': article.fakeid,
            ':title': article.title,
            ':link': article.link,
            ':content': article.content ?? '',
            ':author': article.author ?? '',
            ':source_url': article.source_url ?? '',
            ':cover_image': article.cover_image ?? '',
            ':publish_date': article.publish_date ?? '',
            ':read_count': article.read_count ?? 0,
            ':like_count': article.like_count ?? 0,
        });
        persistDb();
        return {};
    });
    electron_1.ipcMain.handle('db:clearArticles', () => {
        if (!db)
            return null;
        db.run('DELETE FROM articles');
        persistDb();
        return {};
    });
    electron_1.ipcMain.handle('db:getSetting', (_, key) => {
        if (!db)
            return null;
        const row = rowFromExec(db, 'SELECT value FROM settings WHERE key = ?', [key]);
        return row?.value ?? null;
    });
    electron_1.ipcMain.handle('db:setSetting', (_, key, value) => {
        if (!db)
            return null;
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', {
            ':key': key,
            ':value': value,
        });
        persistDb();
        return {};
    });
    // WeChat API（与 Web 端一致：使用 scanloginqrcode + Referer/Origin）
    const wechatMpHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://mp.weixin.qq.com/',
        Origin: 'https://mp.weixin.qq.com',
    };
    electron_1.ipcMain.handle('wechat:getQrcode', async () => {
        try {
            // 与 Web 一致：先 startlogin 拿 uuid，再带 cookie 请求 getqrcode 拿图片
            const sessionId = `${Date.now()}${Math.floor(Math.random() * 100)}`;
            const startRes = await axios_1.default.post('https://mp.weixin.qq.com/cgi-bin/bizlogin', new URLSearchParams({
                userlang: 'zh_CN',
                redirect_url: '',
                login_type: '3',
                sessionid: sessionId,
                token: '',
                lang: 'zh_CN',
                f: 'json',
                ajax: '1',
            }).toString(), {
                params: { action: 'startlogin' },
                headers: {
                    ...wechatMpHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                responseType: 'arraybuffer',
            });
            let uuid = '';
            const setCookie1 = startRes.headers['set-cookie'];
            if (setCookie1) {
                const list = Array.isArray(setCookie1) ? setCookie1 : [setCookie1];
                for (const s of list) {
                    const m = s.match(/uuid=([^;]+)/);
                    if (m) {
                        uuid = m[1].trim();
                        break;
                    }
                }
            }
            if (!uuid) {
                const bodyStr = Buffer.from(startRes.data).toString('utf8').slice(0, 300);
                electron_log_1.default.warn('WeChat startlogin no uuid', startRes.status, bodyStr);
                throw new Error('获取登录会话失败，请重试');
            }
            electron_log_1.default.info('WeChat startlogin ok', { uuid: uuid.slice(0, 16) });
            const response = await axios_1.default.get('https://mp.weixin.qq.com/cgi-bin/scanloginqrcode', {
                params: { action: 'getqrcode', random: Date.now() },
                headers: {
                    ...wechatMpHeaders,
                    Cookie: `uuid=${uuid}`,
                },
                responseType: 'arraybuffer',
                maxRedirects: 5,
            });
            const contentType = (response.headers['content-type'] || '').toLowerCase();
            const buffer = response.data;
            if (buffer.byteLength === 0) {
                electron_log_1.default.warn('WeChat getqrcode empty body', response.status, contentType);
                throw new Error('获取二维码失败：返回为空');
            }
            if (contentType.startsWith('image/')) {
                const base64 = Buffer.from(buffer).toString('base64');
                const mime = contentType.split(';')[0].trim() || 'image/png';
                const dataUrl = `data:${mime};base64,${base64}`;
                electron_log_1.default.info('WeChat getQrcode ok (image)', { uuid: uuid?.slice(0, 16) });
                return { img: dataUrl, uuid };
            }
            if (contentType.includes('json') || contentType === '') {
                const str = Buffer.from(buffer).toString('utf8');
                const data = JSON.parse(str);
                const imgPath = (data.img ?? data.qrcode_url);
                const uuidFromBody = (data.uuid ?? data.qr_code);
                if (imgPath) {
                    electron_log_1.default.info('WeChat getQrcode ok (json)', { uuid: (uuidFromBody || uuid)?.slice(0, 16) });
                    return { img: imgPath, uuid: uuidFromBody || uuid };
                }
                electron_log_1.default.warn('WeChat getQrcode json without img', data?.base_resp ?? data);
            }
            electron_log_1.default.warn('WeChat getQrcode unexpected', contentType, buffer.byteLength);
            throw new Error('获取二维码失败：接口返回异常');
        }
        catch (error) {
            electron_log_1.default.error('Failed to get qrcode:', error?.message, error?.response?.status, error?.response?.data);
            throw error;
        }
    });
    electron_1.ipcMain.handle('wechat:checkScan', async (_, uuid) => {
        try {
            // 与 Web 一致：uuid 通过 Cookie 传递，不放在 query
            const response = await axios_1.default.get('https://mp.weixin.qq.com/cgi-bin/scanloginqrcode', {
                params: {
                    action: 'ask',
                    token: '',
                    lang: 'zh_CN',
                    f: 'json',
                    ajax: 1,
                },
                headers: {
                    ...wechatMpHeaders,
                    Cookie: `uuid=${uuid}`,
                },
            });
            const data = response.data;
            if (data && (data.status === 1 || data.status === 4 || data.status === 6)) {
                electron_log_1.default.info('WeChat checkScan', data.status, data.cookies ? 'has cookies' : '');
            }
            // status=1 时：从 body 或 Set-Cookie 拿到会话 cookie，并必须带上 uuid（扫码会话标识）给 confirmLogin
            if (data?.status === 1) {
                let fromBody = (data.cookies ?? data.cookie ?? '');
                const setCookie = response.headers['set-cookie'];
                if (!fromBody && setCookie) {
                    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
                    fromBody = list.map((s) => s.split(';')[0].trim()).join('; ');
                }
                const uuidPart = `uuid=${uuid}`;
                data.cookies = fromBody ? `${uuidPart}; ${fromBody}`.trim() : uuidPart;
                electron_log_1.default.info('WeChat checkScan status=1: cookie for confirm length', data.cookies?.length ?? 0);
            }
            return data;
        }
        catch (error) {
            electron_log_1.default.error('Failed to check scan:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('wechat:confirmLogin', async (_, cookie) => {
        try {
            electron_log_1.default.info('WeChat confirmLogin: POST bizlogin?action=login, cookie length', cookie?.length ?? 0);
            // POST bizlogin?action=login 拿 redirect_url（含 token）
            const response = await axios_1.default.post('https://mp.weixin.qq.com/cgi-bin/bizlogin', new URLSearchParams({
                userlang: 'zh_CN',
                redirect_url: '',
                cookie_forbidden: '0',
                cookie_cleaned: '0',
                plugin_used: '0',
                login_type: '3',
                token: '',
                lang: 'zh_CN',
                f: 'json',
                ajax: '1',
            }).toString(), {
                params: { action: 'login' },
                headers: {
                    ...wechatMpHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Cookie: cookie,
                },
            });
            const data = response.data;
            electron_log_1.default.info('WeChat confirmLogin: POST response status', response.status, 'body keys', data ? Object.keys(data) : []);
            if (data?.base_resp && typeof data.base_resp === 'object') {
                electron_log_1.default.info('WeChat confirmLogin: base_resp', JSON.stringify(data.base_resp));
            }
            if (data?.redirect_url) {
                electron_log_1.default.info('WeChat confirmLogin: top-level redirect_url present');
            }
            // 优先使用顶层 redirect_url
            let redirectUrl = data?.redirect_url;
            // 部分接口只返回 base_resp，redirect_url 可能在其内
            if (!redirectUrl && data?.base_resp && typeof data.base_resp === 'object') {
                redirectUrl = data.base_resp.redirect_url;
            }
            if (redirectUrl && typeof redirectUrl === 'string') {
                electron_log_1.default.info('WeChat confirmLogin ok');
                return { redirect_url: redirectUrl };
            }
            // 无 redirect_url 时：合并 POST 返回的 Set-Cookie，再 GET home 拿带 token 的跳转 URL
            const setCookie = response.headers['set-cookie'];
            const setCookieList = setCookie ? (Array.isArray(setCookie) ? setCookie : [setCookie]) : [];
            electron_log_1.default.info('WeChat confirmLogin: POST Set-Cookie count', setCookieList.length, 'names', setCookieList.map((s) => s.split('=')[0]?.trim()).filter(Boolean));
            let cookieToUse = cookie;
            if (setCookieList.length > 0) {
                const parts = setCookieList.map((s) => s.split(';')[0].trim()).filter(Boolean);
                if (parts.length)
                    cookieToUse = [...cookie.split(';').map(s => s.trim()), ...parts].filter(Boolean).join('; ');
            }
            electron_log_1.default.info('WeChat confirmLogin: GET home (maxRedirects=0)');
            const homeRes = await axios_1.default.get('https://mp.weixin.qq.com/cgi-bin/home', {
                params: { action: 'home', lang: 'zh_CN', token: '' },
                headers: { ...wechatMpHeaders, Cookie: cookieToUse },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
            }).catch((err) => {
                const status = err.response?.status;
                const headers = err.response?.headers ?? {};
                const loc = headers.location ?? headers.Location;
                electron_log_1.default.info('WeChat confirmLogin: GET home caught err', 'status', status, 'hasLocation', Boolean(loc), 'location', loc ? (typeof loc === 'string' ? loc.slice(0, 80) : String(loc)) : '');
                if (status && status >= 300 && status < 400 && loc) {
                    const url = typeof loc === 'string' && loc.startsWith('http') ? loc : `https://mp.weixin.qq.com${typeof loc === 'string' && loc.startsWith('/') ? '' : '/'}${loc}`;
                    return { data: null, redirect_url: url };
                }
                if (err.response?.data && typeof err.response.data === 'object') {
                    electron_log_1.default.info('WeChat confirmLogin: GET home error body keys', Object.keys(err.response.data));
                }
                throw err;
            });
            const fromResponse = homeRes.redirect_url;
            if (fromResponse && typeof fromResponse === 'string') {
                const path = fromResponse.startsWith('http') ? new URL(fromResponse).pathname + new URL(fromResponse).search : fromResponse;
                electron_log_1.default.info('WeChat confirmLogin ok (from home Location)');
                return { redirect_url: path || fromResponse };
            }
            const homeData = homeRes.data;
            if (homeData != null) {
                electron_log_1.default.info('WeChat confirmLogin: GET home body type', typeof homeData, Array.isArray(homeData) ? 'array' : '', typeof homeData === 'object' ? 'keys ' + Object.keys(homeData).join(',') : '');
                if (typeof homeData === 'object' && homeData !== null) {
                    const str = JSON.stringify(homeData);
                    electron_log_1.default.info('WeChat confirmLogin: GET home body sample', str.slice(0, 300));
                }
            }
            if (homeData && typeof homeData === 'object') {
                const r = homeData;
                const fromHome = r.redirect_url ?? r.base_resp?.redirect_url;
                if (fromHome && typeof fromHome === 'string') {
                    electron_log_1.default.info('WeChat confirmLogin ok (from home body)');
                    return { redirect_url: fromHome };
                }
            }
            // 从 POST 响应的 Set-Cookie 中尝试解析 token（部分环境 token 在 cookie 里）
            for (const line of setCookieList) {
                const pair = line.split(';')[0].trim();
                const eq = pair.indexOf('=');
                if (eq > 0 && pair.slice(0, eq).toLowerCase() === 'token') {
                    const tokenVal = pair.slice(eq + 1).trim();
                    if (tokenVal) {
                        electron_log_1.default.info('WeChat confirmLogin ok (token from Set-Cookie)');
                        return { redirect_url: `/cgi-bin/home?token=${encodeURIComponent(tokenVal)}` };
                    }
                }
            }
            electron_log_1.default.warn('WeChat confirmLogin no redirect_url. POST body keys:', data ? Object.keys(data) : [], 'base_resp:', data?.base_resp ? JSON.stringify(data.base_resp) : 'null', 'full data sample:', JSON.stringify(data).slice(0, 400));
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('Failed to confirm login:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('wechat:searchBiz', async (_, keyword, cookie, token) => {
        try {
            const response = await axios_1.default.get('https://mp.weixin.qq.com/cgi-bin/searchbiz', {
                params: {
                    action: 'search_biz',
                    fakeid: '',
                    keyword,
                    token,
                    lang: 'zh_CN',
                    f: 'json',
                    ajax: 1,
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Cookie: cookie,
                },
            });
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('Failed to search biz:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('wechat:getArticles', async (_, fakeid, cookie, token, appmsgToken) => {
        try {
            const response = await axios_1.default.get('https://mp.weixin.qq.com/cgi-bin/appmsgpublish', {
                params: {
                    action: 'list',
                    fakeid,
                    token,
                    lang: 'zh_CN',
                    f: 'json',
                    ajax: 1,
                    appmsg_token: appmsgToken,
                    weixin_2021_1: 1,
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Cookie: cookie,
                },
            });
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('Failed to get articles:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('wechat:getArticleDetail', async (_, link, cookie) => {
        try {
            const response = await axios_1.default.get(link, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Cookie: cookie,
                },
            });
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('Failed to get article detail:', error);
            throw error;
        }
    });
    // Export
    electron_1.ipcMain.handle('export:saveFile', async (_, filePath, data) => {
        try {
            fs_1.default.writeFileSync(filePath, Buffer.from(data, 'base64'));
            return { success: true };
        }
        catch (error) {
            electron_log_1.default.error('Failed to save file:', error);
            return { success: false, error: error.message };
        }
    });
    // Notification
    electron_1.ipcMain.handle('notification:show', (_, title, body) => {
        const { Notification } = require('electron');
        new Notification({ title, body }).show();
    });
    // License operations
    electron_1.ipcMain.handle('license:getDeviceId', async () => {
        try {
            // Generate device ID based on machine characteristics
            const deviceInfo = [
                electron_1.app.getPath('home'),
                electron_1.app.getPath('userData'),
                process.platform,
                process.arch,
                os_1.default.hostname(),
            ].join('|');
            const deviceId = crypto_1.default.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 64);
            electron_log_1.default.info('Generated device ID:', deviceId.substring(0, 8) + '...');
            return deviceId;
        }
        catch (error) {
            electron_log_1.default.error('Failed to get device ID:', error);
            throw error;
        }
    });
    // License API calls through main process to avoid CORS
    electron_1.ipcMain.handle('license:activate', async (_, code, deviceId) => {
        try {
            const serverUrl = await getServerUrl();
            const apiBase = getLicenseApiBase(serverUrl);
            const url = `${apiBase}/api/license/activate`;
            electron_log_1.default.info('License activate: requesting', url, { code: code?.slice(0, 8) + '...', deviceId: deviceId?.slice(0, 8) + '...' });
            const response = await axios_1.default.post(url, {
                code,
                device_id: deviceId,
            });
            electron_log_1.default.info('License activate: success', response.data);
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('License activation failed:', error.message, error.response?.status, error.response?.data);
            return {
                success: false,
                error: error.response?.data?.error || error.message || '激活失败，请检查网络连接',
            };
        }
    });
    electron_1.ipcMain.handle('license:validate', async (_, deviceId) => {
        try {
            const serverUrl = await getServerUrl();
            const apiBase = getLicenseApiBase(serverUrl);
            const response = await axios_1.default.get(`${apiBase}/api/license/validate`, {
                params: { device_id: deviceId },
            });
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('License validation failed:', error.message);
            return {
                valid: false,
                error: error.response?.data?.error || '校验失败，请检查网络连接',
            };
        }
    });
    electron_1.ipcMain.handle('license:logout', async (_, deviceId) => {
        try {
            const serverUrl = await getServerUrl();
            const apiBase = getLicenseApiBase(serverUrl);
            const response = await axios_1.default.post(`${apiBase}/api/license/logout`, {
                device_id: deviceId,
            });
            return response.data;
        }
        catch (error) {
            electron_log_1.default.error('License logout failed:', error.message);
            return {
                success: false,
                error: error.response?.data?.error || '登出失败，请检查网络连接',
            };
        }
    });
    electron_log_1.default.info('IPC handlers registered');
}
// App lifecycle
electron_1.app.whenReady().then(async () => {
    electron_log_1.default.info('App ready');
    try {
        await initDatabase();
        setupIpcHandlers();
        createWindow();
        createTray();
    }
    catch (err) {
        electron_log_1.default.error('Startup failed', err);
        throw err;
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    electron_log_1.default.info('Application quitting');
    if (db) {
        db.close();
        electron_log_1.default.info('Database closed');
    }
});
electron_log_1.default.info('Main process initialized');
//# sourceMappingURL=main.js.map