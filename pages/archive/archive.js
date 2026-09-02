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
        loading: false
      });
    }).catch(() => { this.setData({ loading: false }); });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    getApp().globalData.space = s;
    if (s === 'family') this.loadFamily();
    else this.loadPersonal();
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
        sharedDetail: detail
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
    wx.navigateTo({ url: '/pages/new-task/new-task' });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/archive-detail/archive-detail?id=' + id });
  },
  goAddRecord() {
    wx.navigateTo({ url: '/pages/add-record/add-record' });
  }
});
