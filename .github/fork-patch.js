'use strict';

/**
 * 一次性补丁：默认关闭全部自动测速（由 fork-patch workflow 运行，跑完即删）。
 *
 * 1. Script/mihomoScript.js、Script/Script.js：
 *    - 自动选择 / 负载均衡 / 生成地区自动选择组 → 默认 false（省得内核自动测速）
 *    - selectBaseOption 不再携带 url / interval 等健康检查字段
 * 2. Test/suites/integration.js：补两条回归测试
 * 3. .github/localize.js：追加「同步上游后兜底恢复本改动」的逻辑
 *
 * 任何一处没匹配上都会抛错，workflow 随之失败、不会产生半成品提交。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text, 'utf8');

function replaceOnce(rel, from, to) {
  const src = read(rel);
  const count = src.split(from).length - 1;
  if (count !== 1) {
    throw new Error(rel + '：目标片段匹配 ' + count + ' 次（应为 1 次）：' + from.slice(0, 60));
  }
  write(rel, src.replace(from, to));
}

// --- 1. 覆写脚本：默认关闭自动测速 ---
const SELECT_FROM = "// select策略组通用配置\nconst selectBaseOption = {\n  ...groupBaseOption,\n  type: 'select',\n};";
const SELECT_TO =
  "// select策略组通用配置（不带健康检查字段，内核不会对 select 组自动测速）\nconst selectBaseOption = {\n  type: 'select',\n  'empty-fallback': 'REJECT',\n};";

for (const file of ['Script/mihomoScript.js', 'Script/Script.js']) {
  replaceOnce(
    file,
    '  自动选择: true, // 是否启用自动选择策略组',
    '  自动选择: false, // 是否启用自动选择策略组（默认关闭：url-test 会持续自动测速）',
  );
  replaceOnce(
    file,
    '  生成地区自动选择组: true, // 是否生成地区自动选择策略组',
    '  生成地区自动选择组: false, // 是否生成地区自动选择策略组（默认关闭：避免内核自动测速）',
  );
  replaceOnce(file, SELECT_FROM, SELECT_TO);
}
replaceOnce(
  'Script/mihomoScript.js',
  '  负载均衡: true, // 是否启用负载均衡策略组',
  '  负载均衡: false, // 是否启用负载均衡策略组（默认关闭：load-balance 会持续健康检查）',
);

// --- 2. 回归测试 ---
const TEST_ANCHOR =
  "  h.test('生成地区自动选择组=false → 无自动选择组', () =>\n" +
  '    withOptions(api, { 生成地区自动选择组: false }, () => {\n' +
  '      const out = api.main(fx.minimalSubscription());\n' +
  "      h.assert(!out['proxy-groups'].some((g) => g.name.endsWith('-自动选择')), '不应有自动选择组');\n" +
  "      h.assert(groupByName(out['proxy-groups'], '香港'), '香港组仍应存在');\n" +
  '    }),\n' +
  '  );';
const TEST_ADDED = String.raw`
  h.test('默认关闭自动测速：无自动测速类型策略组，且策略组不带健康检查字段', () => {
    for (const cfg of [fx.typicalSubscription(), fx.minimalSubscription()]) {
      const out = api.main(cfg);
      for (const g of out['proxy-groups']) {
        h.assert(!['url-test', 'load-balance', 'fallback'].includes(g.type), '策略组 ' + g.name + ' 不应为自动测速类型');
        h.assert(!('interval' in g), '策略组 ' + g.name + ' 不应带 interval');
        h.assert(!('url' in g), '策略组 ' + g.name + ' 不应带 url');
      }
    }
  });
  h.test('打开开关可恢复自动测速组（自动选择 / 地区自动选择）', () =>
    withOptions(api, { 自动选择: true, 生成地区自动选择组: true }, () => {
      const out = api.main(fx.minimalSubscription());
      h.assert(out['proxy-groups'].some((g) => g.name === '自动选择' && g.type === 'url-test'), '应恢复「自动选择」组');
      h.assert(out['proxy-groups'].some((g) => g.name.endsWith('-自动选择') && g.type === 'url-test'), '应恢复地区自动选择组');
    }),
  );`;
replaceOnce('Test/suites/integration.js', TEST_ANCHOR, TEST_ANCHOR + TEST_ADDED);

// --- 3. localize.js 兜底 ---
const LOCALIZE = '.github/localize.js';
const HEADER_FROM = ' * 图片链接故意不改：图片内容一样，指向上游可以少一份本地差异。\n */';
const HEADER_TO =
  ' * 图片链接故意不改：图片内容一样，指向上游可以少一份本地差异。\n *\n * 另外兜底 fork 的「默认关闭自动测速」改动：同步上游用 -X theirs 合并，\n * 冲突处会取上游版本，这里把被冲掉的默认值与 select 组配置重新写回（见文件末尾）。\n */';
const GUARD = String.raw`
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
console.log(forkPatched ? '✓ 已恢复 fork 默认（关闭自动测速）' : 'fork 默认（关闭自动测速）未被改动');`;

if (read(LOCALIZE).includes('兜底 fork 的「默认关闭自动测速」改动')) {
  console.log('localize.js 已包含兜底逻辑，跳过');
} else {
  replaceOnce(LOCALIZE, HEADER_FROM, HEADER_TO);
  write(LOCALIZE, read(LOCALIZE).trimEnd() + '\n\n' + GUARD.trim() + '\n');
}

console.log('✓ fork patch 已应用到：Script x2 / Test / localize.js');
