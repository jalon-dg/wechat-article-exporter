import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const webDir = new URL('../apps/web/', import.meta.url);
const webPackageJson = new URL('./package.json', webDir);

if (!existsSync(webPackageJson)) {
  process.stdout.write('[postinstall] apps/web not present, skipping nuxt prepare\n');
} else {
  process.stdout.write('[postinstall] running nuxt prepare in apps/web\n');
  execSync('yarn --cwd apps/web prepare', { stdio: 'inherit' });
}

// 不再为 Electron 重建 better-sqlite3：桌面客户端已改用 sql.js，管理端 (Node) 需要按当前 Node 编译的 better-sqlite3
