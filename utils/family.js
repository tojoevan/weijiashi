// 家庭（多家庭模型，每人最多 3 个）——云端实现。
// 所有成员名册、邀请、归属都落在数据湖；本模块只是薄封装 + 当前家庭的本地持久化。
// 依赖 sync._adapter（CLOUD_ENABLED=true 时为 cloudflare 适配器，含 family* 方法）。
const sync = require('./sync/index.js');
const cloud = sync._adapter;
const profile = require('./profile.js');

const CURRENT_KEY = 'js_current_family';
const FAM_LIST_KEY = 'js_family_list';   // 家庭列表本地缓存（同步读名字，免每次开页打云端）
const _inviteCache = {};       // family_id -> code，避免反复生成邀请
let _memberCache = [];         // 最近一次加载的当前家庭成员（供 search.js 同步读取）
let _listPromise = null;        // 家庭列表请求 in-flight 守卫（并发去重：同刻多调用合并为一次）

function getCurrentFamily() {
  try { return wx.getStorageSync(CURRENT_KEY) || null; } catch (e) { return null; }
}
function setCurrentFamily(id) {
  try {
    if (id) wx.setStorageSync(CURRENT_KEY, id);
    else wx.removeStorageSync(CURRENT_KEY);
  } catch (e) {}
}

// 返回 {id, name}；名字来自本地缓存的列表（listFamilies 时落盘），同步、免网络。
// 无当前家庭或缓存缺失 → {id:null, name:''}。
function getCurrentFamilyInfo() {
  const id = getCurrentFamily();
  if (!id) return { id: null, name: '' };
  let list = [];
  try { list = wx.getStorageSync(FAM_LIST_KEY) || []; } catch (e) { list = []; }
  const f = (Array.isArray(list) ? list : []).find((x) => x.family_id === id);
  return { id, name: f ? f.name : '' };
}

// 家庭空间分段标签（无论当前选中个人还是家庭都显示当前家庭名）。
// 有当前家庭 →「家庭空间 · 名字」（超 max 字截断加省略号）；无当前家庭 →「家庭空间」。
// space 参数保留仅为兼容既有调用，名字展示与其无关（仅展示、不切换）。
function familySpaceLabel(space, max) {
  const info = getCurrentFamilyInfo();
  const name = info.name || '';
  const cut = max && name.length > max ? name.slice(0, max) + '…' : name;
  return cut ? '家庭空间 · ' + cut : '家庭空间';
}

// 取当前用户的家庭列表。带 in-flight 去重：同一时刻的多次调用共享同一个请求，
// 避免三主 tab onShow 同发多请求放大跨境链路。结果落盘缓存供名字同步读取。
function listFamilies() {
  if (!_listPromise) {
    const p = (async () => {
      const r = await cloud.familyMine();
      const list = Array.isArray(r) ? r : [];
      try { wx.setStorageSync(FAM_LIST_KEY, list); } catch (e) {}
      const cur = getCurrentFamily();
      if (!list.some((f) => f.family_id === cur) && list.length) setCurrentFamily(list[0].family_id);
      return list;
    })();
    _listPromise = p;
    p.finally(() => { _listPromise = null; });
  }
  return _listPromise;
}

// 确保存在一个"当前家庭"：本地未记录时取列表第一个并落存。
// 避免编辑/档案页直接分享时拿不到 family_id，写出 null/'default' 孤儿（谁的家庭都查不到）。
async function ensureCurrentFamily() {
  const cur = getCurrentFamily();
  if (cur) return cur;
  await listFamilies();
  return getCurrentFamily();
}

// 确保当前家庭名可用：缓存缺名字但有 family_id 时，异步补拉列表并落盘。
// 返回 Promise；resolve 后 getCurrentFamilyInfo().name 即可用（用于冷启动个人空间自愈）。
async function ensureFamilyInfo() {
  const info = getCurrentFamilyInfo();
  if (info.name || !info.id) return info;
  await listFamilies().catch(() => {});
  return getCurrentFamilyInfo();
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

// 所有者切换某共享项的协作编辑开关（co_edit）。
async function setItemPerm(id, coEdit) {
  return cloud.setItemPerm(id, coEdit);
}

// 家庭成员勾选/取消完成（共享待办，与内容编辑解耦）。
async function setItemDone(id, done) {
  return cloud.setItemDone(id, done);
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
  getCurrentFamilyInfo,
  ensureFamilyInfo,
  familySpaceLabel,
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
  setItemPerm,
  setItemDone,
  getRawGroup
};
