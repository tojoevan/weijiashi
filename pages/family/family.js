const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const profile = require('../../utils/profile.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    families: [],        // [{ family_id, name, role }]
    currentFamily: '',   // 当前选中的家庭 id
    currentName: '',
    members: [],         // [{ openid, nickname, role, is_self, initial, roleLabel }]
    selfRole: 'member',  // 当前用户在选中的家庭里的角色
    canManage: false,
    pending: null,       // { token, from } 经分享卡片带入的待接受邀请
    inviteCode: '',
    sharedItems: [],
    detail: null         // 点击共享项后的详情弹层数据
  },
  goBack() {
    // 从分享卡片直接进入时，页面栈只有本页一页，此时 navigateBack 会静默失败。
    // 本项目未配置 tabBar，故栈底时直接 reLaunch 回首页。
    const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : null) || [];
    if (pages.length <= 1) wx.reLaunch({ url: '/pages/today/today' });
    else wx.navigateBack();
  },
  onLoad(options) {
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (options && options.invite) {
      this.setData({ pending: { token: options.invite, from: decodeURIComponent(options.from || '好友') } });
    }
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    const app = getApp();
    const pending = (app && app.globalData && app.globalData.pendingInvite) || this.data.pending;
    if (pending) this.setData({ pending });
    this.reload();
  },
  // 加载家庭列表 + 当前家庭的成员 + 邀请码 + 共享内容
  async reload() {
    try {
      const families = await family.listFamilies();
      let current = family.getCurrentFamily();
      if (!current && families.length) current = families[0].family_id;
      const fam = families.find((f) => f.family_id === current) || families[0] || null;
      const members = fam ? await family.getMembers(fam.family_id) : [];
      const code = fam ? await family.ensureInviteCode(fam.family_id) : '';
      this.setData({
        families,
        currentFamily: fam ? fam.family_id : '',
        currentName: fam ? fam.name : '',
        members: members.map((m) => Object.assign({}, m, {
          initial: m.is_self ? (m.nickname || '我').charAt(0) : (m.nickname || '友').charAt(0),
          roleLabel: m.role === 'owner' ? '管理员' : '成员'
        })),
        selfRole: fam ? fam.role : 'member',
        canManage: !!(fam && fam.role === 'owner'),
        inviteCode: code || ''
      });
      // 共享内容：按当前家庭过滤（含其他成员的共享项）
      const shared = await sync.getShared(fam ? fam.family_id : '');
      const membersMap = {};
      members.forEach((m) => { membersMap[m.openid] = m; });
      const sharedItems = shared.map((it) => {
        const m = membersMap[it.owner_openid];
        const sharer = m ? (m.is_self ? '我' : (m.nickname || '成员')) : '家庭成员';
        return Object.assign({}, it, { sharer });
      });
      this.setData({ sharedItems });

      // 存量修复：当前成员昵称缺失且已设置本地昵称时，自动回写真名（fire-and-forget）。
      const me = members.find((m) => m.is_self);
      if (me && !me.nickname && profile.isSet()) {
        const nick = profile.displayName();
        family.setMyNickname(fam.family_id, nick).then(() => {
          const ms = (this.data.members || []).map((x) => x.is_self ? Object.assign({}, x, {
            nickname: nick,
            initial: (nick || '我').charAt(0)
          }) : x);
          this.setData({ members: ms });
        }).catch(() => {});
      }
    } catch (e) {}
  },
  // 切换当前家庭
  tapFamily(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.currentFamily) return;
    family.setCurrentFamily(id);
    this.reload();
  },
  // 创建家庭
  async showCreate() {
    const that = this;
    wx.showModal({
      title: '创建家庭',
      editable: true,
      placeholderText: '给家庭起个名字',
      success: async (res) => {
        if (!res.confirm) return;
        const name = (res.content || '').trim() || '我的家庭';
        try {
          await family.createFamily(name);
          wx.showToast({ title: '已创建', icon: 'none' });
          that.reload();
        } catch (e) {
          wx.showToast({ title: '创建失败', icon: 'none' });
        }
      }
    });
  },
  // 接受分享带入的家庭邀请
  async acceptInvite() {
    const p = this.data.pending;
    if (!p) return;
    try {
      const r = await family.acceptInvite(p.token, profile.displayName());
      this._clearPending();
      wx.showToast({
        title: r && r.joined ? '已加入家庭' : '你已在家庭中，无需重复加入',
        icon: 'none'
      });
      this.reload();
    } catch (e) {
      wx.showToast({ title: '接受失败，邀请可能已失效', icon: 'none' });
    }
  },
  ignoreInvite() {
    this._clearPending();
  },
  // 退出 / 转让并退出
  async leaveOrTransfer() {
    const famId = this.data.currentFamily;
    if (!famId) return;
    if (this.data.selfRole === 'owner') {
      const others = this.data.members.filter((m) => !m.is_self);
      if (!others.length) { wx.showToast({ title: '请先邀请成员再转让', icon: 'none' }); return; }
      wx.showActionSheet({
        itemList: others.map((m) => (m.nickname || '成员') + '（新管理员）'),
        success: async (res) => {
          const target = others[res.tapIndex];
          try {
            await family.transferFamily(famId, target.openid);
            await family.leaveFamily(famId);
            wx.showToast({ title: '已转让并退出', icon: 'none' });
            this.reload();
          } catch (e) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      });
    } else {
      wx.showModal({
        title: '退出家庭',
        content: '确定退出「' + this.data.currentName + '」？',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await family.leaveFamily(famId);
            wx.showToast({ title: '已退出', icon: 'none' });
            this.reload();
          } catch (e) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      });
    }
  },
  // 点击共享项 -> 打开详情弹层
  openShared(e) {
    const id = e.currentTarget.dataset.id;
    const it = (this.data.sharedItems || []).find((x) => x.id === id);
    if (!it) return;
    const content = (it.type === 'archive') ? (it.payload || {}) : (it.meta || {});
    const photos = ((content.photos && Array.isArray(content.photos)) ? content.photos : [])
      .map((k) => sync.getImageUrl(k)).filter(Boolean);
    this.setData({
      detail: Object.assign({}, it, {
        text: content.text || '',
        due: content.due || '',
        photos
      })
    });
  },
  closeShared() {
    this.setData({ detail: null });
  },
  onShareAppMessage() {
    const code = this.data.inviteCode;
    const selfName = profile.displayName();
    return {
      title: selfName + ' 邀请你加入「微家事」家庭空间，一起打理家务',
      path: '/pages/family/family?invite=' + code + '&from=' + encodeURIComponent(selfName)
    };
  },
  copyInvite() {
    const selfName = profile.displayName();
    const text = '【微家事 · 家庭空间】' + selfName + ' 邀请你加入家庭，一起共享待办与物品档案。'
      + '微信搜索「微家事」小程序，或点开我分享的卡片即可加入。';
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '邀请说明已复制', icon: 'none' }) });
  },
  _clearPending() {
    const app = getApp();
    if (app && typeof app.clearPendingInvite === 'function') app.clearPendingInvite();
    else if (app && app.globalData) app.globalData.pendingInvite = null;
    this.setData({ pending: null });
  }
});
