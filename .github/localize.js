'use strict';

/**
 * 把 README 里指向上游仓库的脚本 / 配置链接，改成本仓库的链接。
 *
 * 同步上游时这一步会重跑，所以上游怎么改 README 都不会把链接改回去，
 * 也不会产生合并冲突（先以上游为准合并，再重写链接）。
 * 图片链接故意不改：图片内容一样，指向上游可以少一份本地差异。
 */

const fs = require('fs');

const UPSTREAM = 'AIsouler/MyClash';
const repo = process.env.GITHUB_REPOSITORY || '';

if (!repo) {
  console.error('✗ 拿不到 GITHUB_REPOSITORY，跳过本地化');
  process.exit(0);
}
if (repo === UPSTREAM) {
  console.log('当前就是上游仓库，无需本地化');
  process.exit(0);
}

const pattern = new RegExp(
  'https://raw\\.githubusercontent\\.com/' + UPSTREAM.replace('/', '\\/') + '/main/(Script|Config)/',
  'g',
);

let total = 0;
for (const file of ['README.md']) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(pattern, `https://raw.githubusercontent.com/${repo}/main/$1/`);
  if (out === src) continue;
  fs.writeFileSync(file, out);
  const n = (src.match(pattern) || []).length;
  total += n;
  console.log(`  ${file}：改了 ${n} 处链接`);
}

console.log(total ? `✓ 已指向 ${repo}` : '链接已是本仓库，无需改动');
