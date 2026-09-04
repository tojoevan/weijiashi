const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const config = require('../../utils/sync/config.js');
const profile = require('../../utils/profile.js');
const { inSpace } = require('../../utils/space.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 3,
    space: 'personal',
    stats: { todo: 0, archive: 0, record: 0 },
    nickname: '',
    avatarUrl: '',
    avatarChar: '我',
    isSet: false,
    mineBadge: false
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({ space: getApp().globalData.space });
    this.loadProfile();
    this.loadStats();
    // 进入「我的」即清除首启红点
    this.clearMineBadge();
  },
  // 资料：来自用户主动设置的真实数据（未设置则为空，不预设身份）
  loadProfile() {
    const p = profile.getProfile();
    const nickname = p.nickname || '';
    this.setData({
      nickname,
      avatarUrl: p.avatarUrl || '',
      avatarChar: profile.avatarChar(nickname),
      isSet: profile.isSet()
    });
  },
  // 统计来自真实数据：待办数 / 档案条目数 / 事务记录条数
  loadStats() {
    const space = getApp().globalData.space;
    Promise.all([sync.getTodos(), sync.getArchive(), sync.getTasks()])
      .then(([todos, archive, tasks]) => {
        const todo = (todos || []).filter(t => inSpace(t, space)).length;
        const archiveN = (archive || []).filter(a => inSpace(a, space)).length;
        const record = (tasks || []).filter(t => inSpace(t, space)).length;
        this.setData({ stats: { todo, archive: archiveN, record } });
      })
      .catch(() => {});
  },
  // 清除「我的」tab 红点（访问该页即清，引导不残留）
  clearMineBadge() {
    try { wx.removeStorageSync('js_mine_badge'); } catch (e) {}
    if (this.data.mineBadge) this.setData({ mineBadge: false });
  },
  // 微信「头像昵称填写能力」：用户主动选择头像
  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl;
    if (!url) return;
    profile.setProfile({ avatarUrl: url });
    this.setData({ avatarUrl: url, isSet: true });
    wx.showToast({ title: '头像已更新', icon: 'none' });
  },
  // 昵称输入（实时回显首字头像）
  onNicknameInput(e) {
    const nickname = (e.detail.value || '').trim();
    this.setData({ nickname, avatarChar: profile.avatarChar(nickname) });
  },
  // 昵称输入完成（落库）
  onNicknameBlur(e) {
    const nickname = (e.detail.value || '').trim();
    profile.setProfile({ nickname });
    this.setData({
      nickname,
      avatarChar: profile.avatarChar(nickname),
      isSet: profile.isSet()
    });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    getApp().globalData.space = s;
    this.loadStats();
  },
  go(e) {
    const p = e.currentTarget.dataset.p;
    if (p === 'backup' || p === 'membership' || p === 'family' || p === 'tag' || p === 'about' || p === 'theme') {
      wx.navigateTo({ url: '/pages/' + p + '/' + p });
    } else {
      wx.redirectTo({ url: '/pages/' + p + '/' + p });
    }
  },
  toast(e) {
    wx.showToast({ title: e.currentTarget.dataset.t, icon: 'none' });
  },
  // 注销并删除我的数据：二次弹窗确认（无需邮件/短信验证），确认后调服务端删除本人全部数据，
  // 再清本地缓存并重启到首页（静默登录会重新生成空账号）。
  onDeleteAccount() {
    wx.showModal({
      title: '注销并删除数据',
      content: '此操作不可恢复，将永久删除你所有的家事、事务、档案、集合及家庭关联。确定继续吗？',
      confirmText: '继续',
      cancelText: '取消',
      success: (r1) => {
        if (!r1.confirm) return;
        // 第二次确认，强化不可逆提示
        wx.showModal({
          title: '再次确认',
          content: '删除后数据无法找回，你确定要注销账号并删除全部数据吗？',
          confirmText: '确认删除',
          cancelText: '再想想',
          success: (r2) => {
            if (!r2.confirm) return;
            this.doDeleteAccount();
          }
        });
      }
    });
  },
  doDeleteAccount() {
    wx.showLoading({ title: '注销中' });
    sync.deleteMyAccount()
      .then(() => {
        wx.hideLoading();
        this.clearLocalAndRestart();
      })
      .catch((e) => {
        wx.hideLoading();
        const m = (e && e.message) || '';
        // 服务端未部署新端点（404）时提示先更新，避免用户困惑
        if (m.indexOf('HTTP 404') === 0) {
          wx.showToast({ title: '请先更新到最新体验版', icon: 'none' });
        } else {
          wx.showModal({
            title: '注销失败',
            content: '删除请求未成功，你的数据未被改动。可稍后重试。',
            showCancel: false
          });
        }
      });
  },
  // 清空本地全部相关缓存（资料/令牌/数据/family），重启用静默登录重建空账号
  clearLocalAndRestart() {
    const keys = [
      'user_profile',
      config.STORAGE_KEYS.token,
      config.STORAGE_KEYS.todos,
      config.STORAGE_KEYS.tasks,
      config.STORAGE_KEYS.archive,
      'js_current_family',
      'js_family_list',
      'js_mine_badge',
      'js_last_sync'
    ];
    keys.forEach((k) => { try { wx.removeStorageSync(k); } catch (e) {} });
    wx.showToast({ title: '已注销并删除', icon: 'success' });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/today/today' });
    }, 1200);
  }
});
