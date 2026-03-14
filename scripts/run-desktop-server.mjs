#!/usr/bin/env node
/**
 * 用「当前进程的 Node」跑 desktop server，避免 concurrently 子进程用到别的 Node 版本
 * （解决 better-sqlite3 的 NODE_MODULE_VERSION 与终端 node -v 不一致）
 */
const major = Number(process.version.slice(1).split('.')[0]);
if (major < 22) {
  console.error(
    `[run-desktop-server] 需要 Node >= 22，当前: ${process.version}。请在该终端执行 nvm use 22 或 fnm use 22 后再运行。`
  );
  process.exit(1);
}

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'apps/desktop/server');
const require = createRequire(import.meta.url);

let nuxtBin;
try {
  nuxtBin = require.resolve('nuxt/bin/nuxt.mjs', { paths: [serverDir, rootDir] });
} catch {
  nuxtBin = path.join(rootDir, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');
}
if (!fs.existsSync(nuxtBin)) {
  console.error('run-desktop-server: nuxt not found at', nuxtBin);
  process.exit(1);
}

const child = spawn(process.execPath, [nuxtBin, 'dev'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  process.exit(code != null ? code : signal ? 1 : 0);
});
