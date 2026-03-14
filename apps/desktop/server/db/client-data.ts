import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_DIR = join(process.cwd(), 'data');
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = join(DB_DIR, 'client-data.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS desktop_account (
    device_id TEXT PRIMARY KEY,
    nickname TEXT,
    fakeid TEXT,
    cookie TEXT NOT NULL,
    token TEXT NOT NULL,
    appmsg_token TEXT,
    weixin_2021_1 INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS desktop_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    account_id INTEGER,
    fakeid TEXT,
    title TEXT NOT NULL,
    link TEXT,
    content TEXT,
    author TEXT,
    source_url TEXT,
    cover_image TEXT,
    publish_date DATETIME,
    read_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, link)
  );

  CREATE TABLE IF NOT EXISTS desktop_settings (
    device_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (device_id, key)
  );

  CREATE INDEX IF NOT EXISTS idx_desktop_articles_device ON desktop_articles(device_id);
`);

export function getAccount(deviceId: string) {
  const stmt = db.prepare('SELECT * FROM desktop_account WHERE device_id = ?');
  return stmt.get(deviceId) as Record<string, unknown> | undefined;
}

export function saveAccount(
  deviceId: string,
  account: {
    nickname: string;
    fakeid: string;
    cookie: string;
    token: string;
    appmsg_token?: string;
    weixin_2021_1?: number;
  }
) {
  const stmt = db.prepare(`
    INSERT INTO desktop_account (device_id, nickname, fakeid, cookie, token, appmsg_token, weixin_2021_1, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(device_id) DO UPDATE SET
      nickname=excluded.nickname, fakeid=excluded.fakeid, cookie=excluded.cookie,
      token=excluded.token, appmsg_token=excluded.appmsg_token, weixin_2021_1=excluded.weixin_2021_1,
      updated_at=CURRENT_TIMESTAMP
  `);
  stmt.run(
    deviceId,
    account.nickname,
    account.fakeid,
    account.cookie,
    account.token,
    account.appmsg_token ?? '',
    account.weixin_2021_1 ?? 0
  );
  return getAccount(deviceId);
}

export function deleteAccount(deviceId: string) {
  const stmt = db.prepare('DELETE FROM desktop_account WHERE device_id = ?');
  stmt.run(deviceId);
}

export function getArticles(deviceId: string) {
  const stmt = db.prepare(
    'SELECT * FROM desktop_articles WHERE device_id = ? ORDER BY publish_date DESC'
  );
  return stmt.all(deviceId) as Record<string, unknown>[];
}

export function saveArticle(
  deviceId: string,
  article: {
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
  }
) {
  const stmt = db.prepare(`
    INSERT INTO desktop_articles (device_id, account_id, fakeid, title, link, content, author, source_url, cover_image, publish_date, read_count, like_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id, link) DO UPDATE SET
      account_id=excluded.account_id, title=excluded.title, content=excluded.content,
      author=excluded.author, source_url=excluded.source_url, cover_image=excluded.cover_image,
      publish_date=excluded.publish_date, read_count=excluded.read_count, like_count=excluded.like_count
  `);
  stmt.run(
    deviceId,
    article.account_id,
    article.fakeid,
    article.title,
    article.link,
    article.content ?? '',
    article.author ?? '',
    article.source_url ?? '',
    article.cover_image ?? '',
    article.publish_date ?? '',
    article.read_count ?? 0,
    article.like_count ?? 0
  );
}

export function clearArticles(deviceId: string) {
  const stmt = db.prepare('DELETE FROM desktop_articles WHERE device_id = ?');
  stmt.run(deviceId);
}

export function getSetting(deviceId: string, key: string): string | null {
  const stmt = db.prepare(
    'SELECT value FROM desktop_settings WHERE device_id = ? AND key = ?'
  );
  const row = stmt.get(deviceId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(deviceId: string, key: string, value: string) {
  const stmt = db.prepare(`
    INSERT INTO desktop_settings (device_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(device_id, key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(deviceId, key, value);
}

export function ensureDefaultSettings(deviceId: string) {
  if (getSetting(deviceId, 'export_path') === null) setSetting(deviceId, 'export_path', '');
  if (getSetting(deviceId, 'concurrency') === null) setSetting(deviceId, 'concurrency', '3');
  if (getSetting(deviceId, 'auto_login') === null) setSetting(deviceId, 'auto_login', 'true');
}
