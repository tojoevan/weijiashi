const theme = require('../../utils/theme.js');
const icons = require('../../utils/icons.js');
const sync = require('../../utils/sync/index.js');
const family = require('../../utils/family.js');

function lower(s) { return (s == null ? '' : '' + s).toLowerCase(); }
function metaText(meta) {
  return (meta && typeof meta === 'object') ? (meta.text || '') : (meta || '');
}
// 把可搜索字段拼成 haystack 数组，做不区分大小写的子串匹配
function hit(haystacks, q) {
  return haystacks.some(h => lower(h).indexOf(q) >= 0);
}

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    keyword: '',
    total: 0,
    groups: []
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  },
  onInput(e) {
    const kw = (e.detail.value || '').trim();
    this.setData({ keyword: kw });
    this.runSearch(kw);
  },
  clear() {
    this.setData({ keyword: '', total: 0, groups: [] });
  },
  goBack() {
    wx.navigateBack();
  },
  runSearch(kw) {
    if (!kw) { this.setData({ total: 0, groups: [] }); return; }
    const q = lower(kw);
    Promise.all([sync.getTodos(), sync.getSections(), sync.getArchive()])
      .then(([todos, sections, archive]) => {
        const group = family.getRawGroup() || { members: [] };
        const members = group.members || [];

        // 待办
        const todosR = (todos || [])
          .filter(t => hit([t.title, t.tag, metaText(t.meta)], q))
          .map(t => ({
            id: t.id, title: t.title, subtitle: metaText(t.meta), tag: t.tag || '',
            dot: t.dot || 'brand', navUrl: '/pages/edit/edit?list=today&id=' + t.id
          }));

        // 事务（sections -> items）
        const tasksR = [];
        (sections || []).forEach(sec => (sec.items || []).forEach(it => {
          if (hit([sec.title, it.title, it.tag, it.meta], q)) {
            tasksR.push({
              id: it.id, title: it.title,
              subtitle: sec.title + (it.meta ? ' · ' + it.meta : ''),
              tag: it.tag || '', dot: it.dot || 'brand',
              navUrl: '/pages/edit/edit?list=tasks&id=' + it.id
            });
          }
        }));

        // 档案
        const archiveR = (archive || [])
          .filter(a => {
            const p = a.payload || {};
            return hit([p.name, p.warrantyEnd, p.buyDate, p.note], q);
          })
          .map(a => {
            const p = a.payload || {};
            return {
              id: a.id, title: p.name || '未命名物品',
              subtitle: p.warrantyEnd ? ('保修至 ' + p.warrantyEnd)
                : (p.buyDate ? ('购入 ' + p.buyDate) : '暂无保修信息'),
              tag: '', dot: a.shared ? 'family' : 'brand',
              navUrl: '/pages/archive-detail/archive-detail?id=' + a.id
            };
          });

        // 家庭成员
        const familyR = members
          .filter(m => hit([m.name, m.role], q))
          .map(m => ({
            id: m.id, title: m.name,
            subtitle: (m.role === 'admin' ? '管理员' : '成员') + (m.isSelf ? ' · 我' : ''),
            tag: '', dot: 'family', navUrl: '/pages/family/family'
          }));

        const groups = [
          { type: 'todos', label: '待办', items: todosR },
          { type: 'tasks', label: '事务', items: tasksR },
          { type: 'archive', label: '档案', items: archiveR },
          { type: 'family', label: '家庭成员', items: familyR }
        ];
        const total = todosR.length + tasksR.length + archiveR.length + familyR.length;
        this.setData({ groups, total });
      })
      .catch(() => { this.setData({ groups: [], total: 0 }); });
  },
  openItem(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  }
});
