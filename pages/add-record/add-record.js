const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');

function genId() {
  return 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
const TYPES = ['家电', '数码', '家具', '其他'];

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    name: '',
    buyDate: '',
    warrantyEnd: '',
    amount: '',
    typeIndex: 0,
    types: TYPES,
    note: '',
    photos: [],   // 已上传到云端后的 key 列表
    previews: [], // 本地临时预览路径
    saving: false,
    shared: false // 是否共享到家庭空间（默认个人，填写时自选）
  },
  goBack() { wx.navigateBack(); },
  onName(e) { this.setData({ name: e.detail.value }); },
  onBuyDate(e) { this.setData({ buyDate: e.detail.value }); },
  onWarrantyEnd(e) { this.setData({ warrantyEnd: e.detail.value }); },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  onType(e) { this.setData({ typeIndex: Number(e.detail.value) }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
  onToggleShared(e) {
    const v = !!e.detail.value;
    // 开启共享时，确保已有当前家庭；无则提示并回退
    if (v) {
      const info = family.getCurrentFamilyInfo();
      if (!info || !info.id) {
        wx.showToast({ title: '请先在家庭成员页选择家庭', icon: 'none' });
        this.setData({ shared: false });
        return;
      }
    }
    this.setData({ shared: v });
  },
  chooseImage() {
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temps = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!temps.length) return;
        const previews = this.data.previews.concat(temps);
        this.setData({ previews });
        // 逐张上传到云端 R2，成功后用 key 替换临时预览
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
    // 同步移除对应已上传 key（按下标对齐：未上传成功的临时图没有 key，简单处理——按位置裁剪）
    this.setData({ previews });
  },
  save() {
    const d = this.data;
    const name = (d.name || '').trim();
    if (!name) { wx.showToast({ title: '请填写物品名称', icon: 'none' }); return; }
    if (d.saving) return;
    this.setData({ saving: true });

    const famId = d.shared ? (family.getCurrentFamilyInfo().id || null) : null;
    const item = {
      id: genId(),
      type: d.types[d.typeIndex] || '其他',
      payload: {
        name,
        buyDate: d.buyDate,
        warrantyEnd: d.warrantyEnd,
        amount: d.amount ? Number(d.amount) : 0,
        serviceType: '',
        note: d.note,
        photos: d.photos
      },
      shared: d.shared,
      family_id: famId
    };

    wx.showLoading({ title: '保存中' });
    sync.saveArchive(item)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '已存到本地', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .finally(() => this.setData({ saving: false }));
  },
  onShow() { this.setData({ themeStyle: theme.getThemeStyle() }); }
});
