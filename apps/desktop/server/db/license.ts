import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_DIR = join(process.cwd(), 'data');
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = join(DB_DIR, 'license.db');
const db = new Database(DB_PATH);

// 初始化数据库表
db.exec(`
  -- 激活码表
  CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(40) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'unused',
    used_at DATETIME,
    expires_at DATETIME,
    device_id VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64)
  );

  -- 设备表（记录激活历史）
  CREATE TABLE IF NOT EXISTS device_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id VARCHAR(64) NOT NULL,
    activation_code_id INTEGER,
    action VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activation_code_id) REFERENCES activation_codes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
  CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
  CREATE INDEX IF NOT EXISTS idx_device_log_device_id ON device_log(device_id);
`);

export interface ActivationCode {
  id: number;
  code: string;
  status: 'unused' | 'used' | 'disabled';
  used_at: string | null;
  expires_at: string | null;
  device_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface DeviceLog {
  id: number;
  device_id: string;
  activation_code_id: number | null;
  action: 'bind' | 'unbind';
  ip_address: string | null;
  created_at: string;
}

// 生成随机激活码（40位大写字母+数字）
export function generateActivationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 40; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 创建激活码
export function createActivationCode(createdBy: string): ActivationCode {
  const code = generateActivationCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const stmt = db.prepare(`
    INSERT INTO activation_codes (code, status, expires_at, created_by)
    VALUES (?, 'unused', ?, ?)
  `);
  const result = stmt.run(code, expiresAt.toISOString(), createdBy);

  return {
    id: Number(result.lastInsertRowid),
    code,
    status: 'unused',
    used_at: null,
    expires_at: expiresAt.toISOString(),
    device_id: null,
    created_at: new Date().toISOString(),
    created_by: createdBy,
  };
}

// 获取激活码
export function getActivationCode(code: string): ActivationCode | undefined {
  const stmt = db.prepare('SELECT * FROM activation_codes WHERE code = ?');
  return stmt.get(code) as ActivationCode | undefined;
}

// 获取激活码 by ID
export function getActivationCodeById(id: number): ActivationCode | undefined {
  const stmt = db.prepare('SELECT * FROM activation_codes WHERE id = ?');
  return stmt.get(id) as ActivationCode | undefined;
}

// 激活码列表
export function getActivationCodes(): ActivationCode[] {
  const stmt = db.prepare('SELECT * FROM activation_codes ORDER BY created_at DESC');
  return stmt.all() as ActivationCode[];
}

// 更新激活码状态
export function updateActivationCode(id: number, updates: Partial<ActivationCode>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  if (fields.length === 0) return;

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f as keyof ActivationCode]);
  const stmt = db.prepare(`UPDATE activation_codes SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

// 设备绑定激活码
export function bindDevice(codeId: number, deviceId: string, ipAddress?: string): ActivationCode | undefined {
  const code = getActivationCodeById(codeId);
  if (!code) return undefined;

  // 记录解绑旧设备
  if (code.device_id) {
    const logStmt = db.prepare(`
      INSERT INTO device_log (device_id, activation_code_id, action, ip_address)
      VALUES (?, ?, 'unbind', ?)
    `);
    logStmt.run(code.device_id, codeId, ipAddress || null);
  }

  // 绑定新设备
  const now = new Date();
  const stmt = db.prepare(`
    UPDATE activation_codes
    SET status = 'used', device_id = ?, used_at = ?
    WHERE id = ?
  `);
  stmt.run(deviceId, now.toISOString(), codeId);

  // 记录绑定
  const logStmt = db.prepare(`
    INSERT INTO device_log (device_id, activation_code_id, action, ip_address)
    VALUES (?, ?, 'bind', ?)
  `);
  logStmt.run(deviceId, codeId, ipAddress || null);

  return getActivationCodeById(codeId);
}

// 解绑设备
export function unbindDevice(codeId: number, ipAddress?: string): void {
  const code = getActivationCodeById(codeId);
  if (!code || !code.device_id) return;

  const logStmt = db.prepare(`
    INSERT INTO device_log (device_id, activation_code_id, action, ip_address)
    VALUES (?, ?, 'unbind', ?)
  `);
  logStmt.run(code.device_id, codeId, ipAddress || null);

  const stmt = db.prepare(`
    UPDATE activation_codes
    SET status = 'unused', device_id = NULL, used_at = NULL
    WHERE id = ?
  `);
  stmt.run(codeId);
}

// 获取设备日志
export function getDeviceLogs(codeId?: number): DeviceLog[] {
  let sql = 'SELECT * FROM device_log';
  const params: number[] = [];
  if (codeId) {
    sql += ' WHERE activation_code_id = ?';
    params.push(codeId);
  }
  sql += ' ORDER BY created_at DESC';
  const stmt = db.prepare(sql);
  return stmt.all(...params) as DeviceLog[];
}

// 获取所有设备列表
export function getDevices(): Array<{
  device_id: string;
  activation_code_id: number;
  code: string;
  ip_address: string;
  bound_at: string;
  expires_at: string;
}> {
  const stmt = db.prepare(`
    SELECT
      dl.device_id,
      dl.activation_code_id,
      ac.code,
      dl.ip_address,
      dl.created_at as bound_at,
      ac.expires_at
    FROM device_log dl
    JOIN activation_codes ac ON dl.activation_code_id = ac.id
    WHERE dl.action = 'bind'
    AND dl.id IN (
      SELECT MAX(id) FROM device_log WHERE action = 'bind' GROUP BY device_id
    )
    ORDER BY dl.created_at DESC
  `);
  return stmt.all() as Array<{
    device_id: string;
    activation_code_id: number;
    code: string;
    ip_address: string;
    bound_at: string;
    expires_at: string;
  }>;
}

export { db };