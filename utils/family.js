// 家庭（多家庭模型，每人最多 3 个）——云端实现。
// 所有成员名册、邀请、归属都落在数据湖；本模块只是薄封装 + 当前家庭的本地持久化。
// 依赖 sync._adapter（CLOUD_ENABLED=true 时为 cloudflare 适配器，含 family* 方法）。
const sync = require('./sync/index.js');
const cloud = sync._adapter;

const CURRENT_KEY = 'js_current_family';
const _inviteCache = {};       // family_id -> code，避免反复生成邀请
let _memberCache = [];         // 最近一次加载的当前家庭成员（供 search.js 同步读取）

function getCurrentFamily() {
  try { return wx.getStorageSync(CURRENT_KEY) || null; } catch (e) { return null; }
}
function setCurrentFamily(id) {
  try {
    if (id) wx.setStorageSync(CURRENT_KEY, id);
    else wx.removeStorageSync(CURRENT_KEY);
  } catch (e) {}
}

async function listFamilies() {
  const r = await cloud.familyMine();
  const list = Array.isArray(r) ? r : [];
  const cur = getCurrentFamily();
  if (!list.some((f) => f.family_id === cur) && list.length) setCurrentFamily(list[0].family_id);
  return list;
}

async function createFamily(name) {
  const r = await cloud.familyCreate(name);
  if (r && r.family_id) setCurrentFamily(r.family_id);
  return r;
}

async function ensureInviteCode(familyId) {
  if (!familyId) return null;
  if (!_inviteCache[familyId]) {
    const r = await cloud.familyInvite(familyId);
    if (r && r.code) _inviteCache[familyId] = r.code;
  }
  return _inviteCache[familyId] || null;
}

async function previewInvite(code) {
  return cloud.familyInviteInfo(code);
}

async function acceptInvite(code, nickname) {
  const r = await cloud.familyAccept(code, nickname);
  if (r && r.joined && r.family_id) setCurrentFamily(r.family_id);
  return r;
}

async function getMembers(familyId) {
  const list = await cloud.familyMembers(familyId);
  const arr = Array.isArray(list) ? list : [];
  _memberCache = arr;
  return arr;
}

async function leaveFamily(familyId) {
  const r = await cloud.familyLeave(familyId);
  if (getCurrentFamily() === familyId) setCurrentFamily(null);
  return r;
}

async function transferFamily(familyId, toOpenid) {
  return cloud.familyTransfer(familyId, toOpenid);
}

// 兼容 pages/search/search.js：返回最近一次加载的成员快照（同步读取）。
function getRawGroup() {
  return {
    members: _memberCache.map((m) => ({
      id: m.openid,
      name: m.nickname || '成员',
      role: m.role,
      isSelf: false
    }))
  };
}

module.exports = {
  getCurrentFamily,
  setCurrentFamily,
  listFamilies,
  createFamily,
  ensureInviteCode,
  previewInvite,
  acceptInvite,
  getMembers,
  leaveFamily,
  transferFamily,
  getRawGroup
};
