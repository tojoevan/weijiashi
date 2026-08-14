// 用户资料（昵称 + 头像）。
// 微信小程序已不再自动下发用户昵称/头像，需由用户通过「头像昵称填写能力」
// 主动提供（chooseAvatar 选头像 + input[type=nickname] 填昵称）。
// 资料仅存本地，与登录态(openid)解耦；未授权/未设置时为空，绝不预设具体身份。
const KEY = 'user_profile';
const FALLBACK_NAME = '你';

function getProfile() {
  try { return wx.getStorageSync(KEY) || {}; } catch (e) { return {}; }
}
function setProfile(patch) {
  const next = Object.assign({}, getProfile(), patch);
  try { wx.setStorageSync(KEY, next); } catch (e) {}
  return next;
}
function getName() { return getProfile().nickname || ''; }
function getAvatar() { return getProfile().avatarUrl || ''; }
function isSet() { const p = getProfile(); return !!(p.nickname || p.avatarUrl); }
function displayName() { return getName() || FALLBACK_NAME; }
function avatarChar(name) { const n = (name || '').trim(); return n ? n.charAt(0) : '我'; }

module.exports = {
  KEY, FALLBACK_NAME,
  getProfile, setProfile, getName, getAvatar, isSet, displayName, avatarChar
};
