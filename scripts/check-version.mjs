// 校验 utils/version.js 的 APP_VERSION 与 package.json 的 version 一致，
// 防止「关于微家事」页版本号在发版时漏改。preflight 前置此检查。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const verSrc = readFileSync(join(root, 'utils', 'version.js'), 'utf8');
const m = verSrc.match(/APP_VERSION\s*:\s*'([^']+)'/);

if (!m) {
  console.error('[check-version] 未能在 utils/version.js 中找到 APP_VERSION');
  process.exit(1);
}
if (m[1] !== pkg.version) {
  console.error(`[check-version] 版本不一致：utils/version.js=${m[1]} ≠ package.json=${pkg.version}`);
  process.exit(1);
}
console.log(`[check-version] OK: ${pkg.version}`);
