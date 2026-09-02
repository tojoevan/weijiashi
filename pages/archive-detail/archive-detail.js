const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    item: null,     // { id, type, payload, shared }
    photos: []      // 经 getImageUrl 解析后的可访问地址
  },
  onLoad(query) {
    const id = query && query.id;
    if (!id) { wx.showToast({ title: '缺少档案标识', icon: 'none' }); return; }
    sync.getArchive()
      .then((list) => {
        const it = (list || []).find((a) => a.id === id);
        if (!it) { wx.showToast({ title: '未找到该档案', icon: 'none' }); return; }
        const p = it.payload || {};
        const photos = (p.photos || []).map((k) => sync.getImageUrl(k)).filter(Boolean);
        this.setData({ item: it, photos });
      })
      .catch(() => { wx.showToast({ title: '加载失败', icon: 'none' }); });
    // 预热当前家庭，确保分享时能拿到 family_id（避免写出 'default' 孤儿）
    family.ensureCurrentFamily().catch(() => {});
  },
  goBack() { wx.navigateBack(); },
  async share() {
    const it = this.data.item;
    if (!it) return;
    if (it.shared) { wx.showToast({ title: '已在家庭空间', icon: 'none' }); return; }
    // 确保拿到真实家庭 id（本地未记录时取第一个），避免写出 'default' 孤儿
    const famId = await family.ensureCurrentFamily();
    if (!famId) { wx.showToast({ title: '请先在「家庭」页进入一个家庭', icon: 'none' }); return; }
    const updated = Object.assign({}, it, { shared: true, family_id: famId });
    wx.showLoading({ title: '分享中' });
    sync.saveArchive(updated)
      .then(() => {
        wx.hideLoading();
        this.setData({ 'item.shared': true });
        wx.showToast({ title: '已分享到家庭空间', icon: 'none' });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '分享失败，请重试', icon: 'none' });
      });
  },
  onShow() { this.setData({ themeStyle: theme.getThemeStyle() }); }
});
