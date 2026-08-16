// utils/space.js
// 空间过滤约定（全站统一，与 tasks 页一致）：
//   一项属于「家庭空间」当且仅当 dot==='family' 或 shared===true；
//   「个人空间」取其余。space 为空 / undefined / 'personal' 均按个人处理。
// 纯逻辑、无 require，便于回归测试（scripts/regression-check.mjs 以 vm 载入）。

function isFamilyItem(item) {
  return !!(item && (item.shared === true || item.dot === 'family'));
}

// 返回属于指定空间的子列表
function filterBySpace(items, space) {
  if (!Array.isArray(items)) return [];
  return space === 'family'
    ? items.filter(isFamilyItem)
    : items.filter((it) => !isFamilyItem(it));
}

// 判断单一项是否属于指定空间
function inSpace(item, space) {
  const isFamily = isFamilyItem(item);
  return space === 'family' ? isFamily : !isFamily;
}

module.exports = { isFamilyItem, filterBySpace, inSpace };
