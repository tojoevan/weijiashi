const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const config = require('../../utils/sync/config.js');
const profile = require('../../utils/profile.js');
const { inSpace } = require('../../utils/space.js');
const family = require('../../utils/family.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    selected: 3,
    space: 'personal',
    familySpaceLabel: '家庭空间',
    stats: { todo: 0, archive: 0, record: 0 },
    nickname: '',
    avatarUrl: '',
    avatarChar: '我',
    isSet: false,
    mineBadge: false,
    // 安全注销两阶段状态
    deletionPending: false,      // 已申请注销（宽限期内）
    deletionScheduledAt: 0,      // 预计生效时刻（epoch ms）
    deletionScheduledText: '',   // 预计生效时刻格式化文本
    deletionDue: false           // 宽限期已满，可次日二次确认
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    const space = getApp().globalData.space;
    this.setData({ space });
    family.refreshSpaceLabel(this);
    this.loadProfile();
    this.loadStats();
    // 进入「我的」即清除首启红点
    this.clearMineBadge();
    // 同步注销申请状态（若宽限期已满，弹次日二次确认）
    this.refreshDeletionStatus();
  },
  // 资料：来自用户主动设置的真实数据（未设置则为空，不预设身份）
  loadProfile() {
    const p = profile.getProfile();
    const nickname = p.nickname || '';
    this.setData({
      nickname,
      avatarUrl: p.avatarUrl || '',
      avatarChar: profile.avatarChar(nickname),
      isSet: profile.isSet()
    });
  },
  // 统计来自真实数据：待办 = 未完成/总数；档案 = 条目数；事务 = 未完成/总数
  loadStats() {
    const space = getApp().globalData.space;
    Promise.all([sync.getTodos(), sync.getArchive(), sync.getTasks()])
      .then(([todos, archive, tasks]) => {
        const inTodos = (todos || []).filter(t => inSpace(t, space));
        const inTasks = (tasks || []).filter(t => inSpace(t, space));
        const todoTotal = inTodos.length;
        const todoPending = inTodos.filter(t => !t.done).length;
        const taskTotal = inTasks.length;
        const taskPending = inTasks.filter(t => !(t.meta && t.meta.done)).length;
        const archiveN = (archive || []).filter(a => inSpace(a, space)).length;
        this.setData({
          stats: {
            todo: todoPending + '/' + todoTotal,
            record: taskPending + '/' + taskTotal,
            archive: archiveN
          }
        });
      })
      .catch(() => {});
  },
  // 清除「我的」tab 红点（访问该页即清，引导不残留）
  clearMineBadge() {
    try { wx.removeStorageSync('js_mine_badge'); } catch (e) {}
    if (this.data.mineBadge) this.setData({ mineBadge: false });
  },
  // 微信「头像昵称填写能力」：用户主动选择头像
  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl;
    if (!url) return;
    profile.setProfile({ avatarUrl: url });
    this.setData({ avatarUrl: url, isSet: true });
    wx.showToast({ title: '头像已更新', icon: 'none' });
  },
  // 昵称输入（实时回显首字头像）
  onNicknameInput(e) {
    const nickname = (e.detail.value || '').trim();
    this.setData({ nickname, avatarChar: profile.avatarChar(nickname) });
  },
  // 昵称输入完成（落库）
  onNicknameBlur(e) {
    const nickname = (e.detail.value || '').trim();
    profile.setProfile({ nickname });
    this.setData({
      nickname,
      avatarChar: profile.avatarChar(nickname),
      isSet: profile.isSet()
    });
  },
  setSpace(e) {
    const s = e.currentTarget.dataset.s;
    this.setData({ space: s });
    family.refreshSpaceLabel(this);
    getApp().globalData.space = s;
    this.loadStats();
  },
  go(e) {
    const p = e.currentTarget.dataset.p;
    if (p === 'backup' || p === 'membership' || p === 'family' || p === 'tag' || p === 'about' || p === 'theme') {
      wx.navigateTo({ url: '/pages/' + p + '/' + p });
    } else {
      wx.redirectTo({ url: '/pages/' + p + '/' + p });
    }
  },
  toast(e) {
    wx.showToast({ title: e.currentTarget.dataset.t, icon: 'none' });
  },
  // ===== 安全注销：两阶段（申请 → 24h 宽限 → 次日二次确认/可撤销）=====
  // 阶段一：点「注销并删除数据」→ 申请确认 → 服务端写入待注销行（数据暂不动）。
  // 宽限期内：常驻横幅提供「导出备份」「撤销注销」；数据可正常使用。
  // 阶段二：次日（≥24h）进「我的」→ 弹最终确认：确认释放 / 取消保留。
  onDeleteAccount() {
    if (this.data.deletionPending) {
      // 已申请：提示去横幅操作（导出/撤销）
      const t = this.fmtScheduled(this.data.deletionScheduledAt);
      wx.showModal({
        title: '已申请注销',
        content: '你的账号将于 ' + t + ' 后永久删除。可在下方横幅导出备份或撤销注销。',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }
    wx.showModal({
      title: '申请注销账号',
      content: '注销后你的数据将在 24 小时后被永久删除，期间可随时撤销或导出备份。确定申请吗？',
      confirmText: '申请注销',
      cancelText: '取消',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '申请中' });
        sync.requestDeletion()
          .then((res) => {
            wx.hideLoading();
            const scheduled = (res && res.scheduled_at) || (Date.now() + 86400000);
            this.setData({ deletionPending: true, deletionScheduledAt: scheduled, deletionDue: false, deletionScheduledText: this.fmtScheduled(scheduled) });
            try { wx.setStorageSync('js_delete_pending_ts', Date.now()); } catch (e) {}
            wx.showToast({ title: '已申请，24 小时后生效', icon: 'none' });
          })
          .catch((e) => { wx.hideLoading(); this.handleDeleteErr(e); });
      }
    });
  },
  // 宽限期内撤销注销申请（数据保留）
  onCancelDeletion() {
    wx.showModal({
      title: '撤销注销',
      content: '撤销后你的数据将完整保留，注销申请取消。确定撤销吗？',
      confirmText: '撤销注销',
      cancelText: '再想想',
      success: (r) => {
        if (!r.confirm) return;
        this.doCancelDeletion();
      }
    });
  },
  doCancelDeletion() {
    wx.showLoading({ title: '撤销中' });
    sync.cancelDeletion()
      .then(() => {
        wx.hideLoading();
        this.setData({ deletionPending: false, deletionScheduledAt: 0, deletionDue: false });
        try { wx.removeStorageSync('js_delete_pending_ts'); } catch (e) {}
        wx.showToast({ title: '已撤销，数据保留', icon: 'none' });
      })
      .catch((e) => { wx.hideLoading(); this.handleDeleteErr(e); });
  },
  // 导出备份：复用 /me/export 拿到 JSON，写文件后调起分享（降级到剪贴板）
  onExportBackup() {
    wx.showLoading({ title: '导出中' });
    sync.exportMyData()
      .then((data) => {
        const str = JSON.stringify(data, null, 2);
        const fs = wx.getFileSystemManager();
        const filePath = wx.env.USER_DATA_PATH + '/weijiashi-backup-' + Date.now() + '.json';
        fs.writeFile({
          filePath,
          data: str,
          encoding: 'utf8',
          success: () => {
            wx.hideLoading();
            wx.shareFileMessage({
              filePath,
              fileName: 'weijiashi-backup.json',
              fail: () => {
                // 分享被取消/不支持：降级复制到剪贴板，用户仍可粘贴保存
                wx.setClipboardData({
                  data: str,
                  success: () => wx.showToast({ title: '备份已复制到剪贴板', icon: 'none' })
                });
              }
            });
          },
          fail: () => {
            wx.hideLoading();
            wx.setClipboardData({
              data: str,
              success: () => wx.showToast({ title: '备份已复制到剪贴板', icon: 'none' })
            });
          }
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '导出失败，请稍后重试', icon: 'none' });
      });
  },
  // 同步服务端注销状态：pending 显示横幅；due 弹次日最终确认
  refreshDeletionStatus() {
    sync.getDeletionStatus()
      .then((st) => {
        if (st && st.pending) {
          this.setData({
            deletionPending: true,
            deletionScheduledAt: st.scheduled_at || 0,
            deletionDue: !!st.due,
            deletionScheduledText: this.fmtScheduled(st.scheduled_at)
          });
          if (st.due) this.promptFinalConfirm();
        } else {
          this.setData({ deletionPending: false, deletionScheduledAt: 0, deletionDue: false });
        }
      })
      .catch(() => {});
  },
  // 次日最终确认：确认 → 真正释放；取消 → 撤销保留
  promptFinalConfirm() {
    if (this._finalAsked) return;
    this._finalAsked = true;
    wx.showModal({
      title: '确认注销账号',
      content: '你的注销申请已到生效时间。确认后将永久删除全部数据且无法撤销；选择取消则保留数据并撤销申请。',
      confirmText: '确认删除',
      cancelText: '取消保留',
      success: (r) => {
        if (r.confirm) {
          this.doDeleteAccount();
        } else {
          this.doCancelDeletion();
        }
      }
    });
  },
  doDeleteAccount() {
    wx.showLoading({ title: '注销中' });
    sync.deleteMyAccount()
      .then(() => {
        wx.hideLoading();
        this.clearLocalAndRestart();
      })
      .catch((e) => { wx.hideLoading(); this.handleDeleteErr(e); });
  },
  // 统一错误提示：服务端未部署新端点（404）→ 提示更新；其余 → 失败提示（数据未动）
  handleDeleteErr(e) {
    const m = (e && e.message) || '';
    if (m.indexOf('HTTP 404') === 0) {
      wx.showToast({ title: '请先更新到最新体验版', icon: 'none' });
    } else {
      wx.showModal({
        title: '操作失败',
        content: '请求未成功，你的数据未被改动。可稍后重试。',
        showCancel: false
      });
    }
  },
  // 预计生效时刻格式化（MM-DD HH:mm）
  fmtScheduled(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  // 清空本地全部相关缓存（含待注销标记），重启用静默登录重建空账号
  clearLocalAndRestart() {
    const keys = [
      'user_profile',
      config.STORAGE_KEYS.token,
      config.STORAGE_KEYS.todos,
      config.STORAGE_KEYS.tasks,
      config.STORAGE_KEYS.archive,
      'js_current_family',
      'js_family_list',
      'js_mine_badge',
      'js_last_sync',
      'js_delete_pending_ts'
    ];
    keys.forEach((k) => { try { wx.removeStorageSync(k); } catch (e) {} });
    wx.showToast({ title: '已注销并删除', icon: 'success' });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/today/today' });
    }, 1200);
  }
});
