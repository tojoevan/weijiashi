const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const store = require('../../utils/store.js');
const sync = require('../../utils/sync/index.js');

// 不同来源对应不同的存储 key 与数据结构
const MAP = {
  today: 'js_todos_today',
  tasks: 'js_sections_tasks'
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

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    list: 'today',
    id: '',
    form: { title: '', meta: '', tag: '' },
    datePart: '',
    timePart: '',
    shared: false,
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
      (raw || []).forEach(sec => (sec.items || []).forEach(it => { if (it.id === id) item = it; }));
    } else {
      item = (raw || []).find(t => t.id === id);
    }
    if (!item) {
      wx.showToast({ title: '未找到该项', icon: 'none' });
      return;
    }
    this.setData({
      list,
      id,
      form: { title: item.title, meta: metaText(item.meta), tag: item.tag || '' },
      datePart: metaDue(item.meta).datePart,
      timePart: metaDue(item.meta).timePart,
      shared: item.shared === true || item.dot === 'family',
      photos: metaPhotos(item.meta).map((k) => ({ url: sync.getImageUrl(k), key: k }))
    });
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  },
  toggleShare() {
    this.setData({ shared: !this.data.shared });
  },
  onTitle(e) { this.setData({ 'form.title': e.detail.value }); },
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
    const { list, id, form, shared, photos } = this.data;
    const keys = photos.map((p) => p.key).filter(Boolean);
    let due;
    if (this.data.datePart) due = this.data.datePart + 'T' + (this.data.timePart || '23:59');
    const meta = { text: form.meta, photos: keys, due };
    const patch = { id: id, title: form.title, meta, tag: form.tag, shared: shared, dot: shared ? 'family' : 'brand' };
    // 保存反馈与关闭不依赖网络：适配器已做本地乐观写入，云端同步放后台。
    // try/catch 兜底，确保 toast + 关闭一定执行（云端不可达时也不会卡住页面）。
    try {
      if (list === 'tasks') {
        const sections = (store.read(MAP.tasks) || []).map(sec => Object.assign({}, sec, { items: store.updateById(sec.items || [], id, patch) }));
        const w = sync.saveSections(sections);
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
      if (list === 'tasks') {
        const sections = (store.read(MAP.tasks) || [])
          .map(sec => Object.assign({}, sec, { items: store.removeById(sec.items || [], id) }))
          .filter(sec => (sec.items || []).length > 0);
        const w = sync.saveSections(sections);
        if (w && typeof w.catch === 'function') w.catch(() => {});
      } else {
        const w = sync.deleteTodo(id);
        if (w && typeof w.catch === 'function') w.catch(() => {});
      }
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
