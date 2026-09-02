// 家庭（多家庭模型，每人最多 3 个）——云端实现。
// 所有成员名册、邀请、归属都落在数据湖；本模块只是薄封装 + 当前家庭的本地持久化。
// 依赖 sync._adapter（CLOUD_ENABLED=true 时为 cloudflare 适配器，含 family* 方法）。
const sync = require('./sync/index.js');
const cloud = sync._adapter;
const profile = require('./profile.js');

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

// 确保存在一个"当前家庭"：本地未记录时取列表第一个并落存。
// 避免编辑/档案页直接分享时拿不到 family_id，写出 null/'default' 孤儿（谁的家庭都查不到）。
async function ensureCurrentFamily() {
  const cur = getCurrentFamily();
  if (cur) return cur;
  await listFamilies();
  return getCurrentFamily();
}

async function createFamily(name) {
  const nick = profile.isSet() ? profile.displayName() : '';
  const r = await cloud.familyCreate(name, nick);
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

// 当前成员更新自己在某家庭内的昵称（存量 owner 漏存昵称的回写入口）。
async function setMyNickname(familyId, nickname) {
  return cloud.familySetNickname(familyId, nickname);
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
  ensureCurrentFamily,
  createFamily,
  ensureInviteCode,
  previewInvite,
  acceptInvite,
  getMembers,
  leaveFamily,
  transferFamily,
  setMyNickname,
  getRawGroup
};
