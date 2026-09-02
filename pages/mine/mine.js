const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
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
    isSet: false
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({ space: getApp().globalData.space });
    this.loadProfile();
    this.loadStats();
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
  }
});
