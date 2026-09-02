const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');
const profile = require('../../utils/profile.js');
const family = require('../../utils/family.js');
const sharedFeed = require('../../utils/sharedFeed.js');
const { filterBySpace } = require('../../utils/space.js');

const DISMISS_KEY = 'reminderDismissed';
const TODO_KEY = 'js_todos_today';
const SNOOZE_OPTS = [
  { label: '1 小时后', ms: 3600e3 },
  { label: '今天晚些时候', ms: 6 * 3600e3 },
  { label: '明天', ms: 24 * 3600e3 },
  { label: '本周内', ms: 7 * 24 * 3600e3 }
];

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dateLabel() {
  const d = new Date();
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
}
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const SEED_TODOS = [
  { id: 't1', title: '空调滤网清洗', meta: { text: '个人 · 今天 20:00 · 客厅空调', photos: [] }, tag: '重复', dot: 'brand' },
  { id: 't2', title: '交 8 月物业费', meta: { text: '个人 · 今天 18:00', photos: [] }, tag: '账单', dot: 'brand' },
  { id: 't3', title: '预约空调加氟', meta: { text: '家庭 · 周日 10:00 · 客厅空调', photos: [] }, tag: '家庭', dot: 'family' }
];

// 从 meta.due（"yyyy-MM-ddTHH:mm"，本地时间）解析，无则返回 null
function parseDue(meta) {
  if (!meta || typeof meta !== 'object' || !meta.due) return null;
  const dt = new Date(meta.due);
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtDue(dt) {
  return (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' + WEEK[dt.getDay()] + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 从真实待办派生提醒：仅展示到期时间在 [今天-14天, 今天+7天] 窗口内的项
// 已忽略(ignore) 或 延时(snooze 未到期) 的不显示
function buildReminders(todos, dismissed, now) {
  const out = [];
  const dayMs = 86400e3;
  const nowDate = new Date(now);
  const nextDay = new Date(now); nextDay.setDate(nextDay.getDate() + 1);
  (todos || []).forEach((t) => {
    const due = parseDue(t.meta);
    if (!due) return;
    const diff = due.getTime() - now;
    if (diff < -14 * dayMs) return; // 太久远（逾期过久）不提示
    if (diff > 7 * dayMs) return;   // 太遥远不提示
    const dis = dismissed[t.id];
    if (dis) {
      if (dis.type === 'ignore') return;
      if (dis.type === 'snooze' && now < dis.until) return;
    }
    let desc;
    if (diff < 0) {
      const past = Math.floor(-diff / dayMs);
      desc = past <= 0 ? '已逾期 · 原定 ' + fmtDue(due) : '已逾期 ' + past + ' 天 · 原定 ' + fmtDue(due);
    } else if (sameDay(nowDate, due)) {
      desc = '今天 ' + pad(due.getHours()) + ':' + pad(due.getMinutes()) + ' 到期';
    } else if (sameDay(nextDay, due)) {
      desc = '明天 ' + pad(due.getHours()) + ':' + pad(due.getMinutes()) + ' 到期';
    } else {
      desc = fmtDue(due) + ' 到期';
    }
    out.push({
      id: t.id,
      title: t.title,
      desc,
      actionLabel: '去处理',
      actionTarget: '/pages/edit/edit?list=today&id=' + t.id
    });
  });
  return out;
}

function loadDismissed() {
  try { return wx.getStorageSync(DISMISS_KEY) || {}; } catch (e) { return {}; }
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 0,
    space: 'personal',
    dateText: dateLabel(),
    greeting: greeting(),
    greetName: profile.displayName(),
    todos: sync.mode === 'local' ? filterBySpace(store.ensure(TODO_KEY, SEED_TODOS), 'personal') : [],
    visibleReminders: sync.mode === 'local' ? buildReminders(filterBySpace(SEED_TODOS, 'personal'), {}, Date.now()) : [],
    sharedItems: [],
    sharedDetail: null,
    selfOpenid: '',
    familyEmpty: false
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({ dateText: dateLabel(), greeting: greeting(), greetName: profile.displayName() });
    const app = getApp();
    const space = app.globalData.space;
    this.setData({ space });
    if (space === 'family') this.loadFamily();
    else this.loadPersonal();
  },
  // 个人空间：仅展示自己的待办（含提醒）
  loadPersonal() {
    sync.getTodos().then((todos) => {
      this._allTodos = todos;
      const view = filterBySpace(todos, 'personal');
      this.setData({ todos: view, sharedItems: [], sharedDetail: null });
      this.setData({ visibleReminders: buildReminders(view, loadDismissed(), Date.now()) });
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
        sharedDetail: null,
        visibleReminders: []
      });
    }).catch(() => {});
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
      : '/pages/edit/edit?list=today&id=' + id;
    wx.navigateTo({ url });
  },
  go(e) {
    const p = e.currentTarget.dataset.p;
    wx.redirectTo({ url: '/pages/' + p + '/' + p });
  },
  goNewTask() {
    wx.navigateTo({ url: '/pages/new-task/new-task' });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  editTodo(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/edit/edit?list=today&id=' + id });
  },
  executeReminder(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.target });
  },
  ignoreReminder(e) {
    const id = e.currentTarget.dataset.id;
    const dismissed = loadDismissed();
    dismissed[id] = { type: 'ignore', until: 0 };
    wx.setStorageSync(DISMISS_KEY, dismissed);
    this.setData({ visibleReminders: buildReminders(this.data.todos, dismissed, Date.now()) });
    wx.showToast({ title: '已忽略提醒', icon: 'none' });
  },
  snoozeReminder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: SNOOZE_OPTS.map(o => o.label),
      success: (res) => {
        const opt = SNOOZE_OPTS[res.tapIndex];
        const dismissed = loadDismissed();
        dismissed[id] = { type: 'snooze', until: Date.now() + opt.ms };
        wx.setStorageSync(DISMISS_KEY, dismissed);
        this.setData({ visibleReminders: buildReminders(this.data.todos, dismissed, Date.now()) });
        wx.showToast({ title: '已延时至' + opt.label, icon: 'none' });
      }
    });
  }
});
