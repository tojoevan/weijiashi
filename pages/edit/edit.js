const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');

// 不同来源对应不同的存储 key 与数据结构
const MAP = {
  today: 'js_todos_today',
  tasks: 'js_tasks'
};

const TAG_CHIPS = ['账单', '家庭', '重复', '保养', '提醒'];

// meta 可能已是对象（含 photos），也可能是旧版的纯字符串
function metaText(meta) {
  if (meta && typeof meta === 'object') return meta.text || '';
  return meta || '';
}
function metaPhotos(meta) {
  if (meta && typeof meta === 'object' && Array.isArray(meta.photos)) return meta.photos;
  return [];
}
// 从 meta.due（"yyyy-MM-ddTHH:mm"）拆出日期与时间，供日期/时间选择器回填
function metaDue(meta) {
  if (meta && typeof meta === 'object' && meta.due && typeof meta.due === 'string') {
    const [datePart, timePart] = meta.due.split('T');
    return { datePart: datePart || '', timePart: timePart || '' };
  }
  return { datePart: '', timePart: '' };
}

// yyyy-MM-dd + HH:mm 转「今天 20:00 / 明天 / 8月12日 周三」（与 new-task 同款，确保 meta.text 拼接一致）
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = (n) => (n < 10 ? '0' + n : '' + n);
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

// 旧数据未存结构化 item 时，从 meta.text（"个人 · 今天 20:00 · 客厅空调"）反解关联物品
// 规则：段[0]=空间前缀；其后若有 ≥2 段，末段即关联物品；若仅 1 段需区分「只有日期」与「只有关联物品」
function extractItemFromMeta(meta) {
  const text = metaText(meta);
  if (!text) return '';
  const segs = text.split(' · ').map((s) => s.trim()).filter(Boolean);
  if (segs.length <= 1) return '';
  const rest = segs.slice(1); // 去掉空间前缀
  if (rest.length >= 2) return rest[rest.length - 1]; // 末段即关联物品
  const s = rest[0]; // 仅剩 1 段：能识别为日期则是「只有日期」，否则视为关联物品
  const isDate = s.startsWith('今天') || s.startsWith('明天') || s.includes('月') ||
    /\d{1,2}:\d{2}/.test(s) || s === '今天' || s === '明天';
  return isDate ? '' : s;
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    list: 'today',
    kind: 'todo',   // 'todo'=待办；'task'=事务（按物品归并）
    id: '',
    form: { title: '', meta: '', tag: '' },
    item: '',       // 关联物品（仅待办可编辑）
    datePart: '',
    timePart: '',
    shared: false,
    coEdit: false,  // 共享时是否允许成员协作编辑（仅所有者可切，默认关）
    photos: [],
    tagChips: TAG_CHIPS
  },
  onLoad(query) {
    const list = query.list || 'today';
    const id = query.id;
    const key = MAP[list] || MAP.today;
    const raw = store.read(key);
    let item;
    if (list === 'tasks') {
      item = (raw || []).find((t) => t.id === id);
    } else {
      item = (raw || []).find(t => t.id === id);
    }
    if (!item) {
      wx.showToast({ title: '未找到该项', icon: 'none' });
      return;
    }
    const kind = list === 'tasks' ? 'task' : 'todo';
    // 待办优先读结构化 item；旧数据无此字段时从 meta.text 反解
    const itemVal = (item.item != null && item.item !== '')
      ? item.item
      : (kind === 'todo' ? extractItemFromMeta(item.meta) : (item.room || ''));
    this.setData({
      list,
      kind,
      id,
      form: { title: item.title, meta: metaText(item.meta), tag: item.tag || '' },
      item: itemVal,
      datePart: metaDue(item.meta).datePart,
      timePart: metaDue(item.meta).timePart,
      shared: item.shared === true || item.dot === 'family',
      coEdit: !!(item.co_edit) && (item.shared === true || item.dot === 'family'),
      photos: metaPhotos(item.meta).map((k) => ({ url: sync.getImageUrl(k), key: k }))
    });
    // 预热当前家庭，确保分享时能拿到 family_id（避免写出 null/'default' 孤儿）
    family.ensureCurrentFamily().catch(() => {});
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  },
  toggleShare() {
    this.setData({ shared: !this.data.shared });
  },
  toggleCoEdit() {
    // 仅对共享项有意义：开启后家庭成员可改内容（受后端 co_edit 门控）。
    // 非所有者即使切到开，保存时后端也会忽略并保留原值。
    this.setData({ coEdit: !this.data.coEdit });
  },
  onTitle(e) { this.setData({ 'form.title': e.detail.value }); },
  onItem(e) { this.setData({ item: e.detail.value }); },
  onTag(e) { this.setData({ 'form.tag': e.detail.value }); },
  pickChip(e) { this.setData({ 'form.tag': e.currentTarget.dataset.t }); },
  clearChip() { this.setData({ 'form.tag': '' }); },
  onMeta(e) { this.setData({ 'form.meta': e.detail.value }); },
  onDate(e) { this.setData({ datePart: e.detail.value }); },
  onTime(e) { this.setData({ timePart: e.detail.value }); },
  chooseImage() {
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temps = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!temps.length) return;
        // 先以临时路径占位显示，上传成功后回填 key 与可访问 URL
        const photos = this.data.photos.concat(temps.map((tp) => ({ url: tp, key: null })));
        this.setData({ photos });
        temps.forEach((tp, i) => {
          sync.uploadImage(tp)
            .then((r) => {
              if (r && r.key) {
                const list = this.data.photos.slice();
                const at = list.findIndex((p) => p.url === tp && !p.key);
                if (at >= 0) { list[at] = { url: sync.getImageUrl(r.key), key: r.key }; this.setData({ photos: list }); }
              }
            })
            .catch(() => {});
        });
      }
    });
  },
  removePhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.photos.slice();
    photos.splice(idx, 1);
    this.setData({ photos });
  },
  goBack() { wx.navigateBack(); },
  save() {
    const { list, id, form, shared, coEdit, photos, item } = this.data;
    const keys = photos.map((p) => p.key).filter(Boolean);
    let due;
    if (this.data.datePart) due = this.data.datePart + 'T' + (this.data.timePart || '23:59');
    // 待办：用结构化字段重新拼 meta.text（与 new-task 一致），确保关联物品可独立编辑且不丢展示
    let metaTextVal;
    if (list === 'today') {
      const spaceLabel = shared ? '家庭' : '个人';
      const parts = [spaceLabel];
      const dt = humanDate(this.data.datePart, this.data.timePart);
      if (dt) parts.push(dt);
      if (item && item.trim()) parts.push(item.trim());
      metaTextVal = parts.join(' · ');
    } else {
      metaTextVal = form.meta; // 事务：保持原「备注」行为
    }
    const meta = { text: metaTextVal, photos: keys, due };
    // 共享时把当前家庭 id 写入，家庭共享列表才能按家庭过滤、并显示其他成员分享
    const famId = shared ? (family.getCurrentFamily && family.getCurrentFamily()) || null : null;
    const patch = { id: id, title: form.title, meta, tag: form.tag, shared: shared, dot: shared ? 'family' : 'brand', family_id: famId, co_edit: shared ? (coEdit ? 1 : 0) : 0 };
    if (list === 'today') patch.item = item;
    if (list === 'tasks') patch.room = item; // 事务的「关联物品」即分组/room
    // 保存反馈与关闭不依赖网络：适配器已做本地乐观写入，云端同步放后台。
    // try/catch 兜底，确保 toast + 关闭一定执行（云端不可达时也不会卡住页面）。
    try {
      if (list === 'tasks') {
        const w = sync.saveTask(patch);
        if (w && typeof w.catch === 'function') w.catch(() => {});
      } else {
        const w = sync.saveTodo(patch);
        if (w && typeof w.catch === 'function') w.catch(() => {});
      }
    } catch (e) { /* 本地写入已在适配器内完成，忽略网络层异常 */ }
    wx.showToast({ title: '已保存', icon: 'none' });
    setTimeout(() => this.closeEdit(), 400);
  },
  remove() {
    const { list, id } = this.data;
    try {
      const w = (list === 'tasks') ? sync.deleteTask(id) : sync.deleteTodo(id);
      if (w && typeof w.catch === 'function') w.catch(() => {});
    } catch (e) { /* 本地删除已在适配器内完成 */ }
    wx.showToast({ title: '已删除', icon: 'none' });
    setTimeout(() => this.closeEdit(), 400);
  },
  // 关闭编辑页：直接返回（navigateBack）；若页面栈异常（只有 1 层）则 reLaunch 回首页。
  // 注意：不要在 navigateBack 前调用 wx.hideToast()，否则会与页面帧销毁抢拍，
  // 触发微信基础库内部 setInterval 读取 __subPageFrameEndTime__ 为 null 的报错（开发者工具 artifact）。
  // toast 会随页面关闭自然消失；用 _closing 守卫避免重复关闭。
  closeEdit() {
    if (this._closing) return;
    this._closing = true;
    const pages = (typeof getCurrentPages === 'function') ? getCurrentPages() : [];
    if (pages && pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/today/today' });
  }
});
