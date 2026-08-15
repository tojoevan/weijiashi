#!/usr/bin/env node
/**
 * 微家事 · 前端回归断言（布局类 bug 自动拦）
 *
 * 背景：0.1.x 曾发生「编辑页底部操作栏复用全局 .action-bar 同名类 →
 * CSS 层叠泄漏 → 整条操作栏左移越界、删除按钮被裁」的 bug。
 * 该 bug 对逻辑测试不可见，只能靠真机目检或此处静态断言拦住。
 * 本脚本在提交/发布前对关键页的关键布局约束做正向断言，防止回归。
 *
 * 用法：
 *   node scripts/regression-check.mjs           # 断言关键页布局约束
 *   node scripts/regression-check.mjs <根目录>   # 指定小程序根目录
 *
 * 纯 Node 内置模块，无第三方依赖。
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || process.cwd();
let failures = 0;

function read(rel) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) { console.error(`✗ 缺失 ${rel}`); process.exit(2); }
  return fs.readFileSync(f, 'utf8');
}
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}
/** 提取某类选择器主规则块 { ... } 的文本（不含嵌套子规则） */
function ruleBlockOf(src, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\.' + escaped + '\\s*\\{', 'g');
  const m = re.exec(src);
  if (!m) return null;
  let depth = 1, i = m.index + m[0].length;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index + m[0].length, i - 1);
}

console.log('\n微家事 · 前端回归断言（布局类 bug 防回归）');

// ===== 编辑页 edit：底部操作栏必须全宽贴底、不偏界 =====
console.log('\n[编辑页 edit]');
const editWxml = read('pages/edit/edit.wxml');
const editWxss = read('pages/edit/edit.wxss');

assert(editWxml.includes('class="edit-actions"'),
  'wxml 底部操作栏使用独立命名 .edit-actions（不复用全局 .action-bar）');
const ea = ruleBlockOf(editWxss, 'edit-actions');
assert(ea !== null, '.edit-actions 样式规则存在');
if (ea) {
  assert(/left\s*:\s*0/.test(ea), '.edit-actions 左锚定 left:0');
  assert(/right\s*:\s*0/.test(ea), '.edit-actions 右锚定 right:0（全宽贴底）');
  assert(!/translateX/.test(ea), '.edit-actions 不含 translateX（防整条左移越界）');
}
assert(editWxml.includes('bindtap="remove"') && editWxml.includes('bindtap="save"'),
  '删除 + 保存 两个按钮均在（上次 bug 曾丢删除按钮）');

// ===== 列表页 .action-bar（全局，居中胶囊）=====
console.log('\n[列表页 .action-bar（全局 app.wxss）]');
const appWxss = read('app.wxss');
const ab = ruleBlockOf(appWxss, 'action-bar');
assert(ab !== null, 'app.wxss 中 .action-bar 类存在');
if (ab) {
  assert(/translateX/.test(ab), '.action-bar 保留 transform:translateX 居中逻辑（设计意图，勿删）');
}
assert(!/\.edit-actions\s*\{/.test(appWxss), 'app.wxss 未全局重定义 .edit-actions（防同名冲突回退）');

// ===== 汇总 =====
if (failures > 0) {
  console.error(`\n✗ 回归断言失败 ${failures} 项 —— 已阻止发布。请修复后再传。`);
  process.exit(1);
}
console.log('\n✓ 全部回归断言通过\n');
process.exit(0);
