const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const { filterBySpace } = require('../../utils/space.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 2,
    space: 'personal',
    loading: true,
    items: []
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({ space: getApp().globalData.space });
    this.load();
  },
  load() {
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
        const items = filterBySpace(all, getApp().globalData.space);
        this.setData({ items, loading: false });
      })
      .catch(() => { this.setData({ loading: false }); });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    getApp().globalData.space = s;
    const items = filterBySpace(this._allItems || [], s);
    this.setData({ items });
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
