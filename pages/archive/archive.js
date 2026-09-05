const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const sharedFeed = require('../../utils/sharedFeed.js');
const { filterBySpace } = require('../../utils/space.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 2,
    space: 'personal',
    familySpaceLabel: '家庭空间',
    mineBadge: false,
    loading: true,
    items: [],
    sharedItems: [],
    sharedDetail: null,
    selfOpenid: '',
    familyEmpty: false
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    const space = getApp().globalData.space;
    this.setData({ space });
    let badge = false; try { badge = wx.getStorageSync('js_mine_badge') === 1; } catch (e) {}
    this.setData({ mineBadge: badge });
    this.setData({ familySpaceLabel: family.familySpaceLabel(space) });
    this.ensureFamilyLabel();
    if (space === 'family') this.loadFamily();
    else this.loadPersonal();
  },
  // 个人空间：自己的物品档案
  loadPersonal() {
    this.setData({ loading: true });
    sync.getArchive()
      .then((list) => {
        const all = (list || []).map((a) => {
          const p = (a && a.payload) || {};
          return {
            id: a.id,
            name: p.name || '未命名物品',
            status: p.warrantyEnd ? ('保修至 ' + p.warrantyEnd) : (p.buyDate ? ('购入 ' + p.buyDate) : '暂无保修信息'),
            dot: a.shared ? 'family' : 'brand'
          };
        });
        this._allItems = all;
        const items = filterBySpace(all, 'personal');
        this.setData({ items, loading: false });
      })
      .catch(() => { this.setData({ loading: false }); });
  },
  // 家庭空间：聚合当前家庭的共享流（自己 + 成员）
  loadFamily() {
    sharedFeed.loadFamilyFeed(['archive']).then(({ familyId, items, selfOpenid }) => {
      this.setData({
        familyId,
        sharedItems: items,
        selfOpenid,
        familyEmpty: items.length === 0,
        sharedDetail: null,
        loading: false,
        familySpaceLabel: family.familySpaceLabel(this.data.space)
      });
    }).catch(() => { this.setData({ loading: false }); });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    this.setData({ familySpaceLabel: family.familySpaceLabel(s) });
    this.ensureFamilyLabel();
    getApp().globalData.space = s;
    if (s === 'family') this.loadFamily();
    else this.loadPersonal();
  },
  // 家庭名缓存未命中（冷启动个人空间路径）时，异步补拉列表后刷新分段标签
  ensureFamilyLabel() {
    const info = family.getCurrentFamilyInfo();
    if (!info.name && info.id) {
      family.ensureFamilyInfo()
        .then(() => this.setData({ familySpaceLabel: family.familySpaceLabel(this.data.space) }))
        .catch(() => {});
    }
  },
  // 家庭共享项 → 打开详情弹层
  openShared(e) {
    const id = e.currentTarget.dataset.id;
    const it = (this.data.sharedItems || []).find((x) => x.id === id);
    if (it) this.setData({ sharedDetail: it });
  },
  closeShared() { this.setData({ sharedDetail: null }); },
  onSharedUpdated() {
    const currentId = this.data.sharedDetail ? this.data.sharedDetail.id : null;
    sharedFeed.loadFamilyFeed(['archive']).then(({ familyId, items, selfOpenid }) => {
      const detail = currentId ? (items.find((x) => x.id === currentId) || null) : null;
      this.setData({
        familyId,
        sharedItems: items,
        selfOpenid,
        familyEmpty: items.length === 0,
        sharedDetail: detail,
        familySpaceLabel: family.familySpaceLabel(this.data.space)
      });
    }).catch(() => {});
  },
  onSharedEdit(e) {
    const { id, type } = e.detail;
    this.setData({ sharedDetail: null });
    const url = type === 'archive'
      ? '/pages/archive-detail/archive-detail?id=' + id
      : (type === 'task' ? '/pages/edit/edit?list=tasks&id=' + id : '/pages/edit/edit?list=today&id=' + id);
    wx.navigateTo({ url });
  },
  go(e) {
    const p = e.currentTarget.dataset.p;
    wx.redirectTo({ url: '/pages/' + p + '/' + p });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  goNewTask() {
    // 档案页底部「+」应创建档案条目，而非待办（修复：原误跳 new-task 建待办）
    wx.navigateTo({ url: '/pages/add-record/add-record' });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/archive-detail/archive-detail?id=' + id });
  },
  goAddRecord() {
    wx.navigateTo({ url: '/pages/add-record/add-record' });
  }
});
