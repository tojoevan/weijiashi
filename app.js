const sync = require('./utils/sync/index.js');
const family = require('./utils/family.js');
const profile = require('./utils/profile.js');

// 待处理邀请的本地存储键（与 family.js 一样由模块自持，沿用 js_ 前缀）。
const INVITE_KEY = 'js_pending_invite';

App({
  globalData: {
    space: 'personal',
    pendingInvite: null // 经分享卡片带入的家庭邀请：{ token, from }
  },
  onLaunch(options) {
    this._captureInvite(options);
    // 冷启动恢复：分享卡片的 query 只在「当次启动」出现，用户关闭小程序后
    // 从主入口再进就丢了。此处把尚未处理的邀请读回内存，避免邀请凭空消失。
    if (!this.globalData.pendingInvite) {
      try {
        const saved = wx.getStorageSync(INVITE_KEY);
        if (saved && saved.token) this.globalData.pendingInvite = saved;
      } catch (e) {}
    }
    // 启用云端时，启动即预热登录（适配器内部会先弹隐私授权再 wx.login）；
    // 即使此处尚未完成，适配器在首次数据请求遇到 401 也会自动重新登录重试。
    if (sync.enabled && typeof sync.preLogin === 'function') {
      sync.preLogin().catch(() => {});
    }
    // 预热家庭列表缓存：默认进入小程序多为个人空间，三主 tab 不会主动拉家庭列表，
    // 导致家庭分段拿不到名字。此处提前拉一次，让家庭名在最常用路径也能展示。
    if (sync.enabled && typeof family.listFamilies === 'function') {
      family.listFamilies().catch(() => {});
    }
    // 首启引导：仅第一次进入、且尚未完善资料时，在「我的」tab 点亮红点，
    // 引导用户去完善资料。用户访问「我的」页即由该页清除（mine.js clearMineBadge），
    // 非阻塞、可跳过；已完善资料的用户不打扰。
    try {
      if (!wx.getStorageSync('js_mine_badge_seeded') && !profile.isSet()) {
        wx.setStorageSync('js_mine_badge_seeded', 1);
        wx.setStorageSync('js_mine_badge', 1);
      }
    } catch (e) {}

    // 版本更新检测：微信发布新版本后，用户冷启动会静默拉包；此处在检测到新包就绪时
    // 主动弹窗提示重启，避免用户一直停留在旧版。下载失败时轻提示，不阻断使用。
    this._setupUpdateManager();
  },
  // 封装微信更新机制，独立于其它启动逻辑，便于单独维护。
  _setupUpdateManager() {
    if (typeof wx.getUpdateManager !== 'function') return; // 老基础库兜底
    const um = wx.getUpdateManager();
    um.onCheckForUpdate((res) => {
      // res.hasUpdate 仅用于排查，无用户感知
    });
    um.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '微家事已发布新版本，是否重启应用以应用更新？',
        confirmText: '重启',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) um.applyUpdate();
        }
      });
    });
    um.onUpdateFailed(() => {
      wx.showToast({ title: '新版本下载失败，可删除小程序后重试', icon: 'none' });
    });
  },
  onShow(options) {
    // 小程序在后台时被分享卡片唤醒，会走 onShow 并带分享 path 的 query。
    this._captureInvite(options);
  },
  // 捕获分享卡片带入的家庭邀请参数（?invite=TOKEN&from=NAME）。
  // 同时落盘，保证冷启动后仍可恢复。
  _captureInvite(options) {
    if (options && options.query && options.query.invite) {
      const inv = {
        token: options.query.invite,
        from: decodeURIComponent(options.query.from || '好友')
      };
      this.globalData.pendingInvite = inv;
      try { wx.setStorageSync(INVITE_KEY, inv); } catch (e) {}
    }
  },
  // 接受或忽略邀请后调用：内存与本地存储一并清除，避免下次进来重复提示。
  clearPendingInvite() {
    this.globalData.pendingInvite = null;
    try { wx.removeStorageSync(INVITE_KEY); } catch (e) {}
  }
});
