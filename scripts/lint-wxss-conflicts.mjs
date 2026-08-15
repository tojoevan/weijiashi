#!/usr/bin/env node
/**
 * 微家事 · WXSS 同名类冲突扫描
 *
 * 根因背景：页面 .wxss 若复用 app.wxss 已定义的全局类名（尤其带
 * position:fixed / transform / left / right 等定位属性的布局类），
 * CSS 按属性逐条判胜负，页面重写了部分属性却漏写其余，会导致全局
 * 规则"层叠泄漏"，表现为布局偏移、元素被裁出屏幕（如编辑页 .action-bar
 * 冲突导致删除按钮消失）。本脚本在提交/发布前静态扫描此类冲突，把
 * 隐患拦在编译之前。
 *
 * 用法：
 *   node scripts/lint-wxss-conflicts.mjs            # 报告所有同名（高危标 ⚠️）
 *   node scripts/lint-wxss-conflicts.mjs --strict   # 存在高危同名则退出码 1（挂发布）
 *   node scripts/lint-wxss-conflicts.mjs <根目录>    # 指定小程序根目录
 *
 * 纯 Node 内置模块，无第三方依赖。
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = args.find((a) => !a.startsWith('--')) || process.cwd();

const appWxss = path.join(root, 'app.wxss');
if (!fs.existsSync(appWxss)) {
  console.error(`✗ 未找到全局样式 ${appWxss}`);
  process.exit(2);
}

// 跳过这些目录（非小程序页面样式）
const SKIP_DIRS = new Set(['node_modules', 'miniprogram_npm', 'dist', '.git', 'backend', 'cloudflarepool']);

/** 提取一个 wxss 文件中所有类名 -> 首次出现行号 */
function extractClasses(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const map = new Map();
  const re = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  lines.forEach((line, i) => {
    // 去掉行内注释，避免从注释里误提类名
    const code = line.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '');
    let m;
    while ((m = re.exec(code))) {
      const name = m[1];
      if (!map.has(name)) map.set(name, i + 1);
    }
  });
  return { src, map };
}

/** 取某行所在 CSS 规则块全文（用于判断是否为定位类） */
function getRuleBlock(src, lineNo) {
  const lines = src.split('\n');
  let i = lineNo - 1;
  while (i < lines.length && !lines[i].includes('{')) i++;
  if (i >= lines.length) return '';
  let depth = 0;
  const buf = [];
  for (; i < lines.length; i++) {
    const l = lines[i];
    for (const ch of l) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    buf.push(l);
    if (depth === 0) break;
  }
  return buf.join('\n');
}

const globalExt = extractClasses(appWxss);

// 递归收集所有页面 .wxss（排除 app.wxss 本身）
const pageFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.wxss') && ent.name !== 'app.wxss') pageFiles.push(p);
  }
}
walk(root);
pageFiles.sort();

const conflicts = [];
let highRisk = 0;
for (const f of pageFiles) {
  const ext = extractClasses(f);
  for (const [cls, line] of ext.map) {
    if (!globalExt.map.has(cls)) continue;
    const gLine = globalExt.map.get(cls);
    const gBlock = getRuleBlock(globalExt.src, gLine);
    // 高危：全局类自身带定位/变换属性，一旦页面漏写就会泄漏破坏布局
    const risky = /position\s*:\s*fixed|transform\s*:|left\s*:|right\s*:|bottom\s*:|top\s*:/.test(gBlock);
    if (risky) highRisk++;
    conflicts.push({ file: f, line, cls, risky, globalLine: gLine });
  }
}

const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

console.log('\n微家事 · WXSS 同名类冲突扫描');
console.log(`全局类来源: app.wxss（${globalExt.map.size} 个类）`);
console.log(`扫描页面样式: ${pageFiles.length} 个文件`);

if (conflicts.length === 0) {
  console.log('\n✓ 未发现页面重定义全局类名\n');
  process.exit(0);
}

for (const c of conflicts) {
  const tag = c.risky ? '⚠️ 高危 · 布局泄漏风险' : '· 同名 · 可能为设计系统复用';
  console.log(`\n[${tag}] .${c.cls}`);
  console.log(`   页面定义: ${rel(c.file)}:${c.line}`);
  console.log(`   全局定义: app.wxss:${c.globalLine}`);
}

console.log(`\n汇总: 同名 ${conflicts.length} 处，其中高危 ${highRisk} 处`);

if (strict && highRisk > 0) {
  console.error(`\n✗ --strict: 存在 ${highRisk} 处高危同名类冲突，已阻止发布。请为页面类改名或显式覆盖全部定位属性。`);
  process.exit(1);
}
console.log('');
process.exit(0);
