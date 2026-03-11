import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const DB_DIR = join(process.cwd(), 'data');
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = join(DB_DIR, 'miniapp.db');
const db = new Database(DB_PATH);

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    biz_name TEXT NOT NULL,
    biz_fakeid TEXT,
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    amount INTEGER DEFAULT 0,
    pay_time INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    completed_at INTEGER,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    result TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_order_id ON tasks(order_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

export interface Order {
  id: string;
  biz_name: string;
  biz_fakeid: string | null;
  email: string;
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'failed';
  amount: number;
  pay_time: number | null;
  created_at: number;
  updated_at: number | null;
  completed_at: number | null;
  error: string | null;
}

export interface Task {
  id: string;
  order_id: string;
  type: 'fetch_articles' | 'generate_ebook' | 'send_email';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result: string | null;
  error: string | null;
  created_at: number;
  updated_at: number | null;
}

// 订单操作
export function createOrder(
  order: Omit<Order, 'created_at' | 'updated_at' | 'completed_at' | 'error'> & { created_at: number }
): Order {
  const stmt = db.prepare(`
    INSERT INTO orders (id, biz_name, biz_fakeid, email, status, amount, pay_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    order.id,
    order.biz_name,
    order.biz_fakeid,
    order.email,
    order.status,
    order.amount,
    order.pay_time,
    order.created_at
  );
  return order as Order;
}

export function getOrder(id: string): Order | undefined {
  const stmt = db.prepare('SELECT * FROM orders WHERE id = ?');
  return stmt.get(id) as Order | undefined;
}

export function updateOrder(id: string, updates: Partial<Order>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f as keyof Order]);
  const stmt = db.prepare(`UPDATE orders SET ${setClause}, updated_at = ? WHERE id = ?`);
  stmt.run(...values, Date.now(), id);
}

export function getOrdersByStatus(status: Order['status']): Order[] {
  const stmt = db.prepare('SELECT * FROM orders WHERE status = ?');
  return stmt.all(status) as Order[];
}

export function getAllOrders(): Order[] {
  const stmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');
  return stmt.all() as Order[];
}

// 任务操作
export function createTask(task: Omit<Task, 'updated_at'> & { created_at: number }): Task {
  const stmt = db.prepare(`
    INSERT INTO tasks (id, order_id, type, status, progress, result, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(task.id, task.order_id, task.type, task.status, task.progress, task.result, task.error, task.created_at);
  return task as Task;
}

export function getTask(id: string): Task | undefined {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  return stmt.get(id) as Task | undefined;
}

export function getTasksByOrderId(orderId: string): Task[] {
  const stmt = db.prepare('SELECT * FROM tasks WHERE order_id = ? ORDER BY created_at ASC');
  return stmt.all(orderId) as Task[];
}

export function updateTask(id: string, updates: Partial<Task>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f as keyof Task]);
  const stmt = db.prepare(`UPDATE tasks SET ${setClause}, updated_at = ? WHERE id = ?`);
  stmt.run(...values, Date.now(), id);
}

export function getPendingTasks(type?: Task['type']): Task[] {
  let sql = 'SELECT * FROM tasks WHERE status = ?';
  const params: string[] = ['pending'];
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ' ORDER BY created_at ASC';
  const stmt = db.prepare(sql);
  return stmt.all(...params) as Task[];
}

export { db };
