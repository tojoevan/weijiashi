const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');

// 由真实待办聚合出标签与计数（无标签归入「其他」）
function aggregate(todos) {
  const counts = {};
  (todos || []).forEach((t) => {
    const tag = (t && t.tag && t.tag.trim()) ? t.tag.trim() : '其他';
    counts[tag] = (counts[tag] || 0) + 1;
  });
  const order = ['账单', '家庭', '重复', '其他'];
  const rank = (n) => { const i = order.indexOf(n); return i === -1 ? 999 : i; };
  return Object.keys(counts)
    .sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b))
    .map((name) => ({
      name,
      count: counts[name],
      color: name === '家庭' ? 'var(--family)' : 'var(--brand)'
    }));
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    tags: []
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
    this.load();
  },
  load() {
    sync.getTodos()
      .then((list) => { this.setData({ tags: aggregate(list) }); })
      .catch(() => { this.setData({ tags: [] }); });
  },
  goBack() { wx.navigateBack(); }
});
