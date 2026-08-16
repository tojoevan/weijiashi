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
import vm from 'node:vm';

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
/** app.wxss 等全局样式中是否声明了某 CSS 变量（--name: value;） */
function tokenDefined(src, name) {
  const safe = name.replace(/-/g, '\\-');
  return new RegExp('--' + safe + '\\s*:').test(src);
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

// ===== 家庭页 family：设计审计发现的潜在问题（门禁盲区，0.1.6 清理）=====
// 背景：lint --strict 只能拦「带定位属性的同名类冲突」，对「颜色 / 变量类」
// 问题无效。以下两条从设计审计（2026-08-15）固化，补该盲区。当前（0.1.5）
// 这两处均为「潜在代码质量缺陷、非用户可见 bug」，故断言现在会报红，逼 0.1.6
// 落地修复后再转绿。
console.log('\n[家庭页 family · 设计审计固化]');
const familyWxss = read('pages/family/family.wxss');

const ib = ruleBlockOf(familyWxss, 'invite-banner');
assert(ib !== null, 'family.wxss 中 .invite-banner 类存在');
if (ib) {
  // 引用了未定义 token 即视为缺陷：要么在 app.wxss 定义 --brand-border，
  // 要么改用真实 token（如 --border-strong）。两种合法修法本断言都放过。
  if (/--brand-border/.test(ib) && !tokenDefined(appWxss, 'brand-border')) {
    assert(false, '.invite-banner 引用了 app.wxss 未定义的 --brand-border（请在 app.wxss 定义该 token，或改用 --border-strong 等真实 token）');
  } else {
    assert(true, '.invite-banner 未引用未定义 token（已定义或已改用真实 token）');
  }
}

const mf = ruleBlockOf(familyWxss, 'member-row .avatar.family');
assert(mf !== null, 'family.wxss 中 .member-row .avatar.family 规则存在');
if (mf) {
  // app.wxss 定义的 --family 为 #7A8471（苔绿）；fallback 误写成蓝绿 #7BA7BC 错色
  assert(!/#7BA7BC/i.test(mf),
    '.avatar.family 的 --family fallback 不得为错误色 #7BA7BC（应为 #7A8471 苔绿）');
}

// ===== 空间过滤逻辑（功能层，防止「切空间不变内容」回归）=====
// 以 vm 载入纯逻辑模块 utils/space.js（CJS，与小程序 require 同源），直接验证行为。
console.log('\n[空间过滤 utils/space.js · 功能逻辑]');
const spaceSrc = read('utils/space.js');
const spaceMod = { exports: {} };
vm.runInNewContext(spaceSrc, { module: spaceMod, exports: spaceMod.exports, console });
const { filterBySpace, inSpace, isFamilyItem } = spaceMod.exports;

// 样本：a=个人, b=家庭, c=仅 shared 标记的家庭, d=家庭(shared=false)
const sample = [
  { id: 'a', dot: 'brand' },
  { id: 'b', dot: 'family' },
  { id: 'c', dot: 'brand', shared: true },
  { id: 'd', dot: 'family', shared: false }
];
assert(Array.isArray(filterBySpace(sample, 'family')), 'filterBySpace 返回数组');
assert(filterBySpace(sample, 'family').length === 3,
  '家庭空间含 dot==="family" 或 shared===true 的项（3 项）');
assert(filterBySpace(sample, 'family').map((t) => t.id).sort().join() === 'b,c,d',
  '家庭空间结果 = b,c,d');
assert(filterBySpace(sample, 'family').every((t) => isFamilyItem(t)),
  '家庭空间结果全部为家庭项（判定与 inSpace 一致）');
assert(filterBySpace(sample, 'personal').length === 1, '个人空间取其余（1 项）');
assert(filterBySpace(sample, 'personal').map((t) => t.id).join() === 'a',
  '个人空间结果 = a');
assert(filterBySpace(sample, undefined).length === 1, '空空间按个人处理');
assert(filterBySpace(null, 'family').length === 0, '非数组输入返回空数组');

assert(inSpace({ dot: 'family' }, 'family') === true, 'family 项在家庭空间 ∈ true');
assert(inSpace({ dot: 'family' }, 'personal') === false, 'family 项在个人空间 ∈ false');
assert(inSpace({ shared: true }, 'family') === true, 'shared 项在家庭空间 ∈ true');
assert(inSpace({ dot: 'brand' }, 'family') === false, 'brand 项在家庭空间 ∈ false');
assert(inSpace({ dot: 'brand' }, 'personal') === true, 'brand 项在个人空间 ∈ true');

// ===== 汇总 =====
if (failures > 0) {
  console.error(`\n✗ 回归断言失败 ${failures} 项 —— 已阻止发布。请修复后再传。`);
  process.exit(1);
}
console.log('\n✓ 全部回归断言通过\n');
process.exit(0);
