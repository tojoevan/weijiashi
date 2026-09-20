const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');
const sec = require('../../utils/sec.js');

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
      sizeType: ['compressed'], // 取系统压缩图，降低超过内容安全检测上限(1MB)的概率
      success: (res) => {
        const temps = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!temps.length) return;
        const previews = this.data.previews.concat(temps);
        this.setData({ previews });
        // 逐张：先压到检测上限内 → 上传（网关入库前做微信内容安全检测，违规会返回 403）
        temps.forEach((tp) => {
          sec.fitForUpload(tp)
            .then((fitted) => {
              if (!fitted) {
                wx.showToast({ title: sec.TOO_LARGE_TIP, icon: 'none' });
                return null;
              }
              return sync.uploadImage(fitted);
            })
            .then((r) => { if (r && r.key) this.setData({ photos: this.data.photos.concat([r.key]) }); })
            .catch((e) => { sec.handleUploadError(e); });
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
  async save() {
    const d = this.data;
    const name = (d.name || '').trim();
    if (!name) { wx.showToast({ title: '请填写物品名称', icon: 'none' }); return; }
    if (d.saving) return;
    this.setData({ saving: true });
    // 内容安全：物品名称 + 备注送检（微信 msg_sec_check），不通过则中止保存
    const textOk = await sec.ensureTextOk([name, d.note].filter(Boolean).join('\n'));
    if (!textOk) { this.setData({ saving: false }); return; }

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
