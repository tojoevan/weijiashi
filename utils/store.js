// 轻量本地存储封装：列表带 id，支持种子初始化与按 id 更新/删除
function read(key) {
  try { return wx.getStorageSync(key); } catch (e) { return ''; }
}
function write(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) {}
}
// 仅在 key 不存在时写入种子（空数组 [] 视为已初始化，不会重复播种）
function ensure(key, seed) {
  const cur = read(key);
  if (cur === '' || cur === undefined || cur === null) {
    write(key, seed);
    return seed;
  }
  return cur;
}
function updateById(list, id, patch) {
  return (list || []).map(it => (it.id === id ? Object.assign({}, it, patch) : it));
}
function removeById(list, id) {
  return (list || []).filter(it => it.id !== id);
}
module.exports = { read, write, ensure, updateById, removeById };
