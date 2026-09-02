// 家庭共享项详情弹层组件：展示归属（分享人）、内容、照片、完成态，
// 并按权限提供操作：标记完成（成员可） / 编辑（owner 或开放协作）/
// 协作编辑开关（仅 owner）。内容编辑的门控由后端强制，这里只做 UI 引导。
const family = require('../../utils/family.js');
const sync = require('../../utils/sync/index.js');

Component({
  properties: {
    item: { type: Object, value: null },
    selfOpenid: { type: String, value: '' }
  },
  data: {
    isOwner: false,
    canEdit: false,
    readOnly: false,
    done: false,
    initial: '友',
    text: '',
    photos: [],
    typeLabel: '待办'
  },
  observers: {
    'item,selfOpenid': function (item, selfOpenid) {
      if (!item) return;
      const isOwner = !!item.owner_openid && item.owner_openid === selfOpenid;
      const coEdit = item.co_edit ? 1 : 0;
      const canEdit = isOwner || coEdit === 1;
      const readOnly = !isOwner && coEdit === 0;
      const content = item.type === 'archive' ? (item.payload || {}) : (item.meta || {});
      const done = !!content.done;
      const photos = ((content.photos && Array.isArray(content.photos)) ? content.photos : [])
        .map((k) => sync.getImageUrl(k)).filter(Boolean);
      const initial = (item.sharer && item.sharer !== '家庭成员') ? item.sharer.charAt(0) : '友';
      const typeLabel = item.type === 'archive' ? '物品档案' : (item.type === 'task' ? '事务' : '待办');
      this.setData({ isOwner, canEdit, readOnly, done, initial, text: content.text || '', photos, typeLabel });
    }
  },
  methods: {
    noop() {},
    close() { this.triggerEvent('close'); },
    onToggleDone() {
      const item = this.data.item;
      if (item.type !== 'todo' && item.type !== 'task') return;
      family.setItemDone(item.id, !this.data.done).then(() => {
        this.setData({ done: !this.data.done });
        this.triggerEvent('updated', { id: item.id });
      }).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
    },
    onToggleCoEdit() {
      const item = this.data.item;
      if (!this.data.isOwner) return;
      const next = item.co_edit ? 0 : 1;
      family.setItemPerm(item.id, next).then(() => {
        this.setData({ 'item.co_edit': next });
        this.triggerEvent('updated', { id: item.id });
        wx.showToast({ title: next ? '已开放协作' : '已设为只读', icon: 'none' });
      }).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
    },
    onEdit() {
      const item = this.data.item;
      this.triggerEvent('edit', { id: item.id, type: item.type });
    }
  }
});
