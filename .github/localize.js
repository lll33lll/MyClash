'use strict';

/**
 * 把 README 里指向上游仓库的脚本 / 配置链接，改成本仓库的链接。
 *
 * 同步上游时这一步会重跑，所以上游怎么改 README 都不会把链接改回去，
 * 也不会产生合并冲突（先以上游为准合并，再重写链接）。
 * 图片链接故意不改：图片内容一样，指向上游可以少一份本地差异。
 *
 * 另外兜底 fork 的「默认关闭自动测速」改动：同步上游用 -X theirs 合并，
 * 冲突处会取上游版本，这里把被冲掉的默认值与 select 组配置重新写回（见文件末尾）。
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

// ---------------------------------------------------------------------------
// 兜底 fork 的「默认关闭自动测速」改动
//
// 同步上游用 git merge -X theirs 合并：冲突处会取上游版本，上游一旦改到这几个
// 默认值或 select 组配置，本 fork 的改动就会被冲掉，这里在合并之后写回去。
// 只做精确替换、可重复执行；找不到对应结构时只警告，不让同步失败。
// ---------------------------------------------------------------------------
const FORK_SCRIPTS = [
  { file: 'Script/Script.js', switches: ['自动选择', '生成地区自动选择组'] },
  { file: 'Script/mihomoScript.js', switches: ['自动选择', '负载均衡', '生成地区自动选择组'] },
];
const STRIPPED_SELECT_BASE = "const selectBaseOption = {\n  type: 'select',\n  'empty-fallback': 'REJECT',\n};";
const LEGACY_SELECT_BASE = "const selectBaseOption = {\n  ...groupBaseOption,\n  type: 'select',\n};";

let forkPatched = 0;
for (const { file, switches } of FORK_SCRIPTS) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  let out = src;

  for (const key of switches) {
    if (out.includes(key + ': false')) continue;
    if (out.includes(key + ': true')) {
      out = out.replace(key + ': true', key + ': false');
      forkPatched++;
      continue;
    }
    console.warn('  ⚠ ' + file + '：找不到「' + key + '」开关，跳过');
  }

  if (!out.includes(STRIPPED_SELECT_BASE) && out.includes(LEGACY_SELECT_BASE)) {
    out = out.replace(LEGACY_SELECT_BASE, STRIPPED_SELECT_BASE);
    forkPatched++;
  } else if (!out.includes(STRIPPED_SELECT_BASE)) {
    console.warn('  ⚠ ' + file + '：selectBaseOption 结构与预期不符，未处理');
  }

  if (out !== src) {
    fs.writeFileSync(file, out);
    console.log('  ' + file + '：已恢复「关闭自动测速」的 fork 默认');
  }
}
console.log(forkPatched ? '✓ 已恢复 fork 默认（关闭自动测速）' : 'fork 默认（关闭自动测速）未被改动');
