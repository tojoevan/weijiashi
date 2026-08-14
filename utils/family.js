// 家庭成员（本地优先，云就绪）。
// 当前 CLOUD_ENABLED=false 时，家庭组仅存于本机 storage；
// 待后端 family_groups / family_members 接口补齐后，本模块可平滑切换为云端读写
// （对外接口签名保持不变，页面无需改动）。
// 设计约束：
//  - 家庭组以「本机用户」为拥有者，首次进入即把自己设为管理员；
//  - 角色仅两种：admin(管理员) / member(成员)；
//  - 仅管理员可邀请、改角色、移除成员，且不能移除/改自己的角色（避免清空管理员）。
const KEY = 'family_group';
const ROLES = { ADMIN: 'admin', MEMBER: 'member' };
const ROLE_LABEL = { admin: '管理员', member: '成员' };

const profile = require('./profile.js');

function readGroup() {
  try { return wx.getStorageSync(KEY) || null; } catch (e) { return null; }
}
function writeGroup(g) {
  try { wx.setStorageSync(KEY, g); } catch (e) {}
  return g;
}
function uid() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function inviteToken() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 确保家庭组对象存在（不自动加成员）。
function ensureGroup() {
  let g = readGroup();
  if (g) return g;
  g = { id: 'fg_' + uid(), name: '我家', createdAt: Date.now(), members: [], invites: [] };
  return writeGroup(g);
}
function getRawGroup() { return ensureGroup(); }

function getSelf(g) {
  g = g || getRawGroup();
  return (g.members || []).find(m => m.isSelf) || null;
}
function getSelfRole(g) {
  const s = getSelf(g);
  return s ? s.role : null;
}
function canManage(g) { return getSelfRole(g) === ROLES.ADMIN; }

// 确保本机用户作为成员存在（默认管理员）。已存在则原样返回，不改角色。
function ensureSelf(role) {
  const g = getRawGroup();
  let self = getSelf(g);
  if (!self) {
    self = {
      id: uid(),
      name: profile.getName() || profile.displayName(),
      avatar: profile.getAvatar() || '',
      role: role || ROLES.ADMIN,
      isSelf: true
    };
    g.members.push(self);
    writeGroup(g);
  }
  return self;
}

// 手动添加成员（本地模式填充家庭名册的主要方式；也可经分享邀请接受入组）。
function addMember(input) {
  const g = getRawGroup();
  const m = {
    id: uid(),
    name: ((input && input.name) || '').trim() || '成员',
    avatar: (input && input.avatar) || '',
    role: (input && input.role) || ROLES.MEMBER,
    isSelf: false,
    invitedBy: (input && input.invitedBy) || ''
  };
  g.members.push(m);
  writeGroup(g);
  return m;
}

// 接受邀请：将本机用户加入家庭组（云就绪：云端模式下此处改为 POST 家庭成员）。
// 若本机已有成员身份则直接返回（避免重复）；否则以「成员」身份加入。
function acceptInvite(fromName) {
  const g = getRawGroup();
  let self = getSelf(g);
  if (self) return self;
  const m = {
    id: uid(),
    name: profile.getName() || profile.displayName() || '我',
    avatar: profile.getAvatar() || '',
    role: ROLES.MEMBER,
    isSelf: true,
    invitedBy: fromName || ''
  };
  g.members.push(m);
  writeGroup(g);
  return m;
}

// 移除成员：仅管理员、且不能移除自己。
function removeMember(memberId) {
  const g = getRawGroup();
  if (!canManage(g)) return false;
  const m = (g.members || []).find(x => x.id === memberId);
  if (!m || m.isSelf) return false;
  g.members = g.members.filter(x => x.id !== memberId);
  writeGroup(g);
  return true;
}

// 设置角色：仅管理员、且不能改自己的角色。
function setRole(memberId, role) {
  const g = getRawGroup();
  if (!canManage(g)) return false;
  if (role !== ROLES.ADMIN && role !== ROLES.MEMBER) return false;
  const m = (g.members || []).find(x => x.id === memberId);
  if (!m || m.isSelf) return false;
  m.role = role;
  writeGroup(g);
  return true;
}

// 创建邀请：返回 token（分享卡片 path 携带）；真实跨设备入组待云端接口。
function createInvite() {
  const g = getRawGroup();
  const t = inviteToken();
  g.invites = g.invites || [];
  g.invites.push({ token: t, byName: profile.displayName(), createdAt: Date.now() });
  writeGroup(g);
  return t;
}

module.exports = {
  ROLES, ROLE_LABEL,
  ensureGroup, getRawGroup, getSelf, getSelfRole, canManage, ensureSelf,
  addMember, acceptInvite, removeMember, setRole, createInvite
};
