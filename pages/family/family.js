const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const profile = require('../../utils/profile.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    groupName: '我家',
    members: [],
    selfRole: 'admin',
    canManage: true,
    sharedItems: [],
    pending: null // { token, from }
  },
  goBack() {
    wx.navigateBack();
  },
  onLoad(options) {
    // 启用右上角「…」转发菜单（兜底，主路径用 button open-type=share）。
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (options && options.invite) {
      this.setData({
        pending: { token: options.invite, from: decodeURIComponent(options.from || '好友') }
      });
    }
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });

    // 经分享卡片进入时，优先采用全局待接受邀请（不自动把自己提为管理员）。
    const app = getApp();
    const pending = (app && app.globalData && app.globalData.pendingInvite) || this.data.pending;
    if (!pending) family.ensureSelf(family.ROLES.ADMIN);

    const g = family.getRawGroup();
    const self = family.getSelf(g);
    const members = (g.members || []).map(m => Object.assign({}, m, {
      initial: (m.name || (m.isSelf ? '我' : '成员')).charAt(0)
    }));
    this.setData({
      groupName: g.name,
      members,
      selfRole: self ? self.role : 'member',
      canManage: self ? self.role === 'admin' : false,
      pending: pending || null
    });

    sync.getShared().then(items => this.setData({ sharedItems: items }));
  },
  // 邀请微信好友：转发小程序卡片，path 携带邀请 token 与邀请人名称。
  onShareAppMessage() {
    const token = family.createInvite();
    const selfName = profile.displayName();
    return {
      title: selfName + ' 邀请你加入「微家事」家庭空间，一起打理家务',
      path: 'pages/family/family?invite=' + token + '&from=' + encodeURIComponent(selfName)
    };
  },
  // 复制邀请说明（无法转发时的兜底，便于自测/口头分享）。
  copyInvite() {
    const selfName = profile.displayName();
    const text = '【微家事 · 家庭空间】' + selfName + ' 邀请你加入家庭，一起共享待办与物品档案。'
      + '微信搜索「微家事」小程序，或点开我分享的卡片即可加入。';
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '邀请说明已复制', icon: 'none' })
    });
  },
  // 接受分享带入的家庭邀请。
  acceptInvite() {
    const p = this.data.pending;
    family.acceptInvite(p && p.from);
    const app = getApp();
    if (app && app.globalData) app.globalData.pendingInvite = null;
    this.setData({ pending: null });
    this.onShow();
    wx.showToast({ title: '已加入家庭', icon: 'none' });
  },
  ignoreInvite() {
    const app = getApp();
    if (app && app.globalData) app.globalData.pendingInvite = null;
    this.setData({ pending: null });
  },
  // 管理员点成员 → 设角色 / 移除。
  tapMember(e) {
    const id = e.currentTarget.dataset.id;
    const g = family.getRawGroup();
    const m = (g.members || []).find(x => x.id === id);
    if (!m) return;
    if (!family.canManage(g) || m.isSelf) return; // 仅管理员可管理他人
    const that = this;
    wx.showActionSheet({
      itemList: ['设为管理员', '设为成员', '移除该成员'],
      success(res) {
        if (res.tapIndex === 0) { family.setRole(id, 'admin'); wx.showToast({ title: '已设为管理员', icon: 'none' }); }
        else if (res.tapIndex === 1) { family.setRole(id, 'member'); wx.showToast({ title: '已设为成员', icon: 'none' }); }
        else if (res.tapIndex === 2) { family.removeMember(id); wx.showToast({ title: '已移除', icon: 'none' }); }
        that.onShow();
      }
    });
  },
  // 手动添加成员（本地模式填充家庭名册）。
  showAdd() {
    const that = this;
    wx.showModal({
      title: '添加家庭成员',
      editable: true,
      placeholderText: '输入成员名称',
      success(res) {
        if (!res.confirm) return;
        const name = (res.content || '').trim();
        if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return; }
        family.addMember({ name });
        that.onShow();
        wx.showToast({ title: '已添加', icon: 'none' });
      }
    });
  }
});
