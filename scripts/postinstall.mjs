import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const webDir = new URL('../apps/web/', import.meta.url);
const webPackageJson = new URL('./package.json', webDir);

if (!existsSync(webPackageJson)) {
  process.stdout.write('[postinstall] apps/web not present, skipping nuxt prepare\n');
  process.exit(0);
}

process.stdout.write('[postinstall] running nuxt prepare in apps/web\n');
execSync('yarn --cwd apps/web prepare', { stdio: 'inherit' });

