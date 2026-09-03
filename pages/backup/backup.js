const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const config = require('../../utils/sync/config.js');
const store = require('../../utils/store.js');

// 把 JSON 字符串写成文件并尝试分享/复制到剪贴板（复用现有逻辑）
function writeAndShare(str, fallbackCopy) {
  const fs = wx.getFileSystemManager();
  const path = wx.env.USER_DATA_PATH + '/weijiashi-backup-' + Date.now() + '.json';
  fs.writeFile({
    filePath: path,
    data: str,
    encoding: 'utf8',
    success: () => {
      if (typeof wx.shareFileMessage === 'function') {
        wx.shareFileMessage({ filePath: path, fail: () => fallbackCopy(str) });
      } else {
        fallbackCopy(str);
      }
    },
    fail: () => fallbackCopy(str)
  });
}

function nowText() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    cloudEnabled: false,
    lastSync: '',
    syncing: false
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.setData({
      cloudEnabled: sync.enabled === true || config.CLOUD_ENABLED === true,
      lastSync: store.read('js_last_sync') || ''
    });
  },
  goBack() { wx.navigateBack(); },
  toast(e) { wx.showToast({ title: e.currentTarget.dataset.t, icon: 'none' }); },
  syncNow() {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    wx.showLoading({ title: '同步中' });
    Promise.all([sync.getTodos(), sync.getArchive()])
      .then(() => {
        const t = nowText();
        store.write('js_last_sync', t);
        this.setData({ lastSync: t, cloudEnabled: true });
        wx.hideLoading();
        wx.showToast({ title: '已同步', icon: 'success' });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '同步失败，已保留本地', icon: 'none' });
      })
      .finally(() => this.setData({ syncing: false }));
  },
  exportData() {
    const fallbackCopy = (s) => {
      wx.setClipboardData({
        data: s,
        success: () => wx.showToast({ title: '备份已复制到剪贴板', icon: 'none' })
      });
    };
    // 优先导出服务端本人全量（含家庭关联、账号信息，最权威）；
    // 未登录/离线时回退到本地缓存导出，保证「导出」始终可用。
    if (!store.read(config.STORAGE_KEYS.token)) {
      const local = {
        todos: store.read(config.STORAGE_KEYS.todos) || [],
        archive: store.read(config.STORAGE_KEYS.archive) || [],
        tasks: store.read(config.STORAGE_KEYS.tasks) || [],
        exportedAt: new Date().toISOString(),
        _note: '本地缓存导出（未登录云端）'
      };
      writeAndShare(JSON.stringify(local, null, 2), fallbackCopy);
      return;
    }
    wx.showLoading({ title: '导出中' });
    sync.exportMyData()
      .then((data) => {
        wx.hideLoading();
        writeAndShare(JSON.stringify(data, null, 2), fallbackCopy);
      })
      .catch(() => {
        // 服务端导出失败，回退本地缓存
        wx.hideLoading();
        const local = {
          todos: store.read(config.STORAGE_KEYS.todos) || [],
          archive: store.read(config.STORAGE_KEYS.archive) || [],
          tasks: store.read(config.STORAGE_KEYS.tasks) || [],
          exportedAt: new Date().toISOString(),
          _note: '本地缓存导出（服务端导出失败）'
        };
        writeAndShare(JSON.stringify(local, null, 2), fallbackCopy);
      });
  }
});
