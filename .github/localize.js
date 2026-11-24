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

// README 之外，Docs 下的说明文档也带脚本 / 配置链接，一起指向本仓库
const LOCALIZE_FILES = ['README.md'];
if (fs.existsSync('Docs')) {
  for (const name of fs.readdirSync('Docs')) {
    if (name.endsWith('.md')) LOCALIZE_FILES.push('Docs/' + name);
  }
}

let total = 0;
for (const file of LOCALIZE_FILES) {
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
  { file: 'Script/Script.js', switches: ['自动选择', '生成地区自动选择组', 'AdBlock'] },
  { file: 'Script/mihomoScript.js', switches: ['自动选择', '负载均衡', '生成地区自动选择组', 'AdBlock'] },
  // 2026-11 上游新增的 Concord 内核脚本，同样套用 fork 默认
  { file: 'Script/concordScript.js', switches: ['自动选择', '负载均衡', '生成地区自动选择组', 'AdBlock'] },
  { file: 'Script/concordScriptLite.js', switches: ['自动选择', '生成地区自动选择组', 'AdBlock'] },
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

// ---------------------------------------------------------------------------
// fork 测试适配
//
// 上游有两条集成用例默认「自动选择」是开的（极简国内外分流模式的策略组清单、
// 生成地区自动选择组的排列顺序）。fork 把「自动选择」默认关掉之后这两条会失败，
// 这里在用例里显式打开「自动选择」，保留上游用例的原意。只做精确替换、可重复执行。
// ---------------------------------------------------------------------------
const FORK_TEST_PATCHES = [
  {
    file: 'Test/suites/integration.js',
    from: 'withOptions(api, { 极简国内外分流模式: true }, () => {',
    to: 'withOptions(api, { 极简国内外分流模式: true, 自动选择: true }, () => {',
  },
  {
    file: 'Test/suites/integration.js',
    from: `  h.test('生成地区自动选择组=true → 自动选择组排在地区组之后', () => {
    const out = api.main(fx.minimalSubscription());
    const names = out['proxy-groups'].map((g) => g.name);
    const idx = names.indexOf('香港');
    h.assert(idx >= 0, '应生成香港组');
    h.assertEqual(names[idx + 1], '香港-自动选择', '自动选择组应紧跟其地区组之后');
    h.assert(!names.slice(0, idx).includes('香港-自动选择'), '自动选择组不应排在地区组之前');
    h.assert(groupByName(out['proxy-groups'], '香港').proxies.includes('香港-自动选择'), '地区组应包含自动选择组');
  });`,
    to: `  h.test('生成地区自动选择组=true → 自动选择组排在地区组之后', () =>
    withOptions(api, { 自动选择: true, 生成地区自动选择组: true }, () => {
      const out = api.main(fx.minimalSubscription());
      const names = out['proxy-groups'].map((g) => g.name);
      const idx = names.indexOf('香港');
      h.assert(idx >= 0, '应生成香港组');
      h.assertEqual(names[idx + 1], '香港-自动选择', '自动选择组应紧跟其地区组之后');
      h.assert(!names.slice(0, idx).includes('香港-自动选择'), '自动选择组不应排在地区组之前');
      h.assert(groupByName(out['proxy-groups'], '香港').proxies.includes('香港-自动选择'), '地区组应包含自动选择组');
    }),
  );`,
  },
];

let testPatched = 0;
for (const { file, from, to } of FORK_TEST_PATCHES) {
  if (!fs.existsSync(file)) {
    console.warn('  ⚠ ' + file + '：文件不存在，跳过测试适配');
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(to)) continue;
  if (!src.includes(from)) {
    console.warn('  ⚠ ' + file + '：找不到需要适配的用例，跳过（同步后请检查测试）');
    continue;
  }
  fs.writeFileSync(file, src.replace(from, to));
  testPatched++;
}
console.log(testPatched ? '✓ 已适配 fork 默认下的上游测试' : '测试无需适配');
