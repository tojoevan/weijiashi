const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');

// 生成足够唯一的本地 id（不依赖 crypto）
function genId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = (n) => (n < 10 ? '0' + n : '' + n);

// 把 yyyy-MM-dd + HH:mm 转成「今天 20:00 / 明天 / 8月12日 周三」这种人话
function humanDate(dp, tp) {
  if (!dp) return '';
  const [y, m, day] = dp.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  if (isNaN(d.getTime())) return dp;
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  let label = (m) + '月' + day + '日 ' + WEEK[d.getDay()];
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, now)) label = '今天';
  else if (sameDay(d, tomorrow)) label = '明天';
  if (tp) label += ' ' + tp;
  return label;
}

const TAG_CHIPS = ['账单', '家庭', '重复', '保养', '提醒'];

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    kind: 'todo',   // 'todo'=待办；'task'=事务（按物品归并）
    space: 'personal',
    title: '',
    item: '',
    datePart: '',   // yyyy-MM-dd
    timePart: '',   // HH:mm
    dateText: '',   // 展示用（如「今天 20:00」）
    tag: '',        // 自定义标签（默认），也可点下方快捷标签
    tagChips: TAG_CHIPS,
    photos: [],     // 已上传到云端后的 key 列表
    previews: []    // 本地临时预览路径
  },
  onLoad(query) {
    // 入口参数 type=tasks 表示从「事务」页进入，创建的是事务（按物品归并）；否则建待办
    this.setData({ kind: (query && query.type === 'tasks') ? 'task' : 'todo' });
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({ space: getApp().globalData.space });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    getApp().globalData.space = s;
  },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onItem(e) { this.setData({ item: e.detail.value }); },
  onDate(e) {
    const dp = e.detail.value;
    this.setData({ datePart: dp, dateText: humanDate(dp, this.data.timePart) });
  },
  onTime(e) {
    const tp = e.detail.value;
    this.setData({ timePart: tp, dateText: humanDate(this.data.datePart, tp) });
  },
  onTag(e) { this.setData({ tag: e.detail.value }); },
  pickChip(e) { this.setData({ tag: e.currentTarget.dataset.t }); },
  clearChip() { this.setData({ tag: '' }); },
  chooseImage() {
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temps = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!temps.length) return;
        this.setData({ previews: this.data.previews.concat(temps) });
        temps.forEach((tp) => {
          sync.uploadImage(tp)
            .then((r) => { if (r && r.key) this.setData({ photos: this.data.photos.concat([r.key]) }); })
            .catch(() => {});
        });
      }
    });
  },
  removePreview(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const previews = this.data.previews.slice();
    previews.splice(idx, 1);
    this.setData({ previews });
  },
  goBack() { wx.navigateBack(); },
  create() {
    const d = this.data;
    const title = (d.title || '').trim();
    if (!title) {
      wx.showToast({ title: d.kind === 'task' ? '请先填写事项标题' : '请先填写待办标题', icon: 'none' });
      return;
    }
    // 事务模式：「关联物品」字段即分组/物品名，必填
    const group = (d.item || '').trim();
    if (d.kind === 'task' && !group) {
      wx.showToast({ title: '请填写分组 / 物品名', icon: 'none' });
      return;
    }
    const spaceLabel = d.space === 'family' ? '家庭' : '个人';
    const parts = [spaceLabel];
    if (d.dateText) parts.push(d.dateText);
    if (d.item && d.item.trim() && d.kind !== 'task') parts.push(d.item.trim());
    // meta 用对象承载：text 用于列表展示，photos 存放云端图片 key，due 存结构化到期时间
    // （"yyyy-MM-ddTHH:mm"，本地时间），提醒模块据此从真实待办派生，无需后端改表
    let due;
    if (d.datePart) due = d.datePart + 'T' + (d.timePart || '23:59');
    const meta = { text: parts.join(' · '), photos: d.photos, due };

    // 真实当前家庭 id：共享项必须写入它，家庭聚合流才能按家庭过滤命中。
    // 修复旧版写死 'default' 导致家庭流匹配不到的坑（事务、待办都受影响）。
    const famId = d.space === 'family' ? (family.getCurrentFamily && family.getCurrentFamily()) || null : null;

    const item = {
      id: genId(),
      title,
      meta,
      item: d.item || '',   // 关联物品（结构化存储，便于编辑页独立读写）
      tag: d.tag || '',
      dot: d.space === 'family' ? 'family' : 'brand',
      shared: d.space === 'family',
      family_id: famId
    };

    // 事务：按项独立存储（2026-09-03 起），room=分组/物品名。
    if (d.kind === 'task') {
      const task = {
        id: genId(),
        title,
        meta,
        tag: d.tag || '',
        dot: d.space === 'family' ? 'family' : 'brand',
        shared: d.space === 'family',
        family_id: famId,
        co_edit: 0,
        room: group
      };
      wx.showLoading({ title: '创建中' });
      Promise.resolve(sync.saveTask(task))
        .then(() => {
          wx.hideLoading();
          wx.showToast({ title: '已创建', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        })
        .catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '已存到本地', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 600);
        });
      return;
    }

    // 待办：写入 js_todos_today
    wx.showLoading({ title: '创建中' });
    sync.saveTodo(item)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已创建', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '已存到本地', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
      });
  }
});
