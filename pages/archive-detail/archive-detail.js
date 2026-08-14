const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');

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
  },
  goBack() { wx.navigateBack(); },
  share() {
    const it = this.data.item;
    if (!it) return;
    if (it.shared) { wx.showToast({ title: '已在家庭空间', icon: 'none' }); return; }
    const updated = Object.assign({}, it, { shared: true, family_id: 'default' });
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
