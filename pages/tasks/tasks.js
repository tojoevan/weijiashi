const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const sharedFeed = require('../../utils/sharedFeed.js');

const SEED_TASKS = [
  { id: 'k1', title: '空调滤网清洗', meta: { text: '个人 · 今天 20:00', photos: [] }, tag: '重复', dot: 'brand', shared: false, family_id: null, room: '客厅空调' },
  { id: 'k2', title: '预约空调加氟', meta: { text: '家庭 · 周日 10:00', photos: [] }, tag: '家庭', dot: 'family', shared: true, family_id: 'default', room: '客厅空调' },
  { id: 'k3', title: '洗衣机深度清洗', meta: { text: '家庭 · 8/20 到期前', photos: [] }, tag: '保养', dot: 'family', shared: true, family_id: 'default', room: '洗衣机' },
  { id: 'k4', title: '续保洗衣机延保', meta: { text: '个人 · 8/20', photos: [] }, tag: '提醒', dot: 'brand', shared: false, family_id: null, room: '洗衣机' }
];

// 把存储里的任务（按项）归一化：meta 可能是字符串或 {text,...} 对象，统一抽出可展示的 _text / done
function normalizeTask(t) {
  const meta = (t && t.meta && typeof t.meta === 'object') ? t.meta : {};
  return Object.assign({}, t, {
    _text: meta.text || '',
    done: !!meta.done
  });
}

// 按 room（分组 / 物品名）归并，保持「按物品归并」的展示形态
function groupByRoom(tasks) {
  const map = {};
  (tasks || []).forEach((t) => {
    const room = t.room || '未分组';
    if (!map[room]) map[room] = [];
    map[room].push(normalizeTask(t));
  });
  return Object.keys(map).map((room) => ({ title: room, items: map[room] }));
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 1,
    space: 'personal',
    familySpaceLabel: '家庭空间',
    sections: [],   // 全量（已按 room 归并、已归一化）
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
    if (sync.mode === 'local') store.ensure('js_tasks', SEED_TASKS);
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    const space = getApp().globalData.space;
    this.setData({ space });
    this.setData({ familySpaceLabel: family.familySpaceLabel(space) });
    if (space === 'family') this.loadFamily();
    else this.loadPersonal();
  },
  // 个人空间：按 room 归并的事务（本地 tasks 存储，按项）
  loadPersonal() {
    sync.getTasks().then((raw) => {
      const sections = groupByRoom(raw);
      const total = (raw || []).length;
      this.setData({ sections, total });
      this.applySpace();
    });
  },
  // 家庭空间：聚合当前家庭的共享流（自己 + 成员）
  loadFamily() {
    sharedFeed.loadFamilyFeed(['task']).then(({ familyId, items, selfOpenid }) => {
      this.setData({
        familyId,
        sharedItems: items,
        selfOpenid,
        familyEmpty: items.length === 0,
        sharedDetail: null,
        familySpaceLabel: family.familySpaceLabel(this.data.space)
      });
    }).catch(() => {});
  },
  // 按当前 space 过滤：家庭空间只看 family 项，个人空间看其余
  applySpace() {
    const space = this.data.space;
    const isFamily = (it) => !!(it && (it.shared === true || it.dot === 'family'));
    const view = this.data.sections
      .map((sec) => ({
        title: sec.title,
        items: sec.items.filter((it) => space === 'family' ? isFamily(it) : !isFamily(it))
      }))
      .filter((sec) => sec.items.length > 0);
    this.setData({ view, empty: view.length === 0 });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    this.setData({ familySpaceLabel: family.familySpaceLabel(s) });
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
    sharedFeed.loadFamilyFeed(['task']).then(({ familyId, items, selfOpenid }) => {
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
