const sync = require('./utils/sync/index.js');

App({
  globalData: {
    space: 'personal',
    pendingInvite: null // 经分享卡片带入的家庭邀请：{ token, from }
  },
  onLaunch(options) {
    this._captureInvite(options);
    // 启用云端时，启动即预热登录（适配器内部会先弹隐私授权再 wx.login）；
    // 即使此处尚未完成，适配器在首次数据请求遇到 401 也会自动重新登录重试。
    if (sync.enabled && typeof sync.preLogin === 'function') {
      sync.preLogin().catch(() => {});
    }
  },
  onShow(options) {
    // 小程序在后台时被分享卡片唤醒，会走 onShow 并带分享 path 的 query。
    this._captureInvite(options);
  },
  // 捕获分享卡片带入的家庭邀请参数（?invite=TOKEN&from=NAME）。
  _captureInvite(options) {
    if (options && options.query && options.query.invite) {
      this.globalData.pendingInvite = {
        token: options.query.invite,
        from: decodeURIComponent(options.query.from || '好友')
      };
    }
  }
});
