const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const sharedFeed = require('../../utils/sharedFeed.js');

const SECTION_KEY = 'js_sections_tasks';
const SEED_SECTIONS = [
  {
    title: '客厅空调', count: '3 项', items: [
      { id: 'k1', title: '空调滤网清洗', meta: '个人 · 今天 20:00', tag: '重复', dot: 'brand' },
      { id: 'k2', title: '预约空调加氟', meta: '家庭 · 周日 10:00', tag: '家庭', dot: 'family' }
    ]
  },
  {
    title: '洗衣机', count: '2 项', items: [
      { id: 'k3', title: '洗衣机深度清洗', meta: '家庭 · 8/20 到期前', tag: '保养', dot: 'family' },
      { id: 'k4', title: '续保洗衣机延保', meta: '个人 · 8/20', tag: '提醒', dot: 'brand' }
    ]
  }
];

// 把存储里的 sections 归一化：meta 可能是字符串或 {text,...} 对象，统一抽出可展示的 _text
function normalize(raw) {
  return (raw || []).map(sec => ({
    title: sec.title,
    items: (sec.items || []).map(it => Object.assign({}, it, {
      _text: (it.meta && typeof it.meta === 'object') ? (it.meta.text || '') : (it.meta || '')
    }))
  }));
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 1,
    space: 'personal',
    sections: [],   // 全量（已归一化）
    view: [],       // 按 space 过滤后的展示列表
    total: 0,
    empty: false,
    sharedItems: [],
    sharedDetail: null,
    selfOpenid: '',
    familyEmpty: false
  },
  onLoad() {
    // 仅在本地模式首启时播种演示数据；已有数据（含手动清空后的 []）不再覆盖
    if (sync.mode === 'local') store.ensure(SECTION_KEY, SEED_SECTIONS);
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    const space = getApp().globalData.space;
    this.setData({ space });
    if (space === 'family') this.loadFamily();
    else this.loadPersonal();
  },
  // 个人空间：按房间归并的事务（本地 sections 文档）
  loadPersonal() {
    sync.getSections().then(raw => {
      const sections = normalize(raw);
      const total = sections.reduce((n, s) => n + s.items.length, 0);
      this.setData({ sections, total });
      this.applySpace();
    });
  },
  // 家庭空间：聚合当前家庭的共享流（自己 + 成员）
  loadFamily() {
    sharedFeed.loadFamilyFeed().then(({ familyId, items, selfOpenid }) => {
      this.setData({
        familyId,
        sharedItems: items,
        selfOpenid,
        familyEmpty: items.length === 0,
        sharedDetail: null
      });
    }).catch(() => {});
  },
  // 按当前 space 过滤：家庭空间只看 dot==='family'，个人空间看其余
  applySpace() {
    const space = this.data.space;
    const view = this.data.sections
      .map(sec => ({
        title: sec.title,
        items: sec.items.filter(it => space === 'family' ? it.dot === 'family' : it.dot !== 'family')
      }))
      .filter(sec => sec.items.length > 0);
    this.setData({ view, empty: view.length === 0 });
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
  onSharedUpdated() { this.loadFamily(); },
  onSharedEdit(e) {
    const { id, type } = e.detail;
    this.setData({ sharedDetail: null });
    const url = type === 'archive'
      ? '/pages/archive-detail/archive-detail?id=' + id
      : '/pages/edit/edit?list=tasks&id=' + id;
    wx.navigateTo({ url });
  },
  go(e) {
    const p = e.currentTarget.dataset.p;
    wx.redirectTo({ url: '/pages/' + p + '/' + p });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  // 事务页的「+」创建「事务」（按物品归并），其余主页的「+」创建「待办」
  goNewTask() {
    wx.navigateTo({ url: '/pages/new-task/new-task?type=tasks' });
  },
  // 点击事务行 → 进入编辑
  editTodo(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/edit/edit?list=tasks&id=' + id });
  }
});
