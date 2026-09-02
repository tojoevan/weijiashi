// 家庭共享聚合流加载（today / tasks / archive 三页「家庭空间」tab 复用）。
// 返回当前家庭的共享项（自己的 + 成员的），并附上分享人昵称 / 副标题 / 完成态。
const sync = require('./sync/index.js');
const family = require('./family.js');

async function loadFamilyFeed() {
  const famId = await family.ensureCurrentFamily();
  if (!famId) return { familyId: '', items: [], membersMap: {}, selfOpenid: '' };
  const [shared, members] = await Promise.all([
    sync.getShared(famId),
    family.getMembers(famId)
  ]);
  const membersMap = {};
  (members || []).forEach((m) => { membersMap[m.openid] = m; });
  const me = (members || []).find((m) => m.is_self);
  const selfOpenid = me ? me.openid : '';
  const items = (shared || []).map((it) => {
    const m = membersMap[it.owner_openid];
    const sharer = m ? (m.is_self ? '我' : (m.nickname || '成员')) : '家庭成员';
    const content = it.type === 'archive' ? (it.payload || {}) : (it.meta || {});
    return Object.assign({}, it, {
      sharer,
      sub: content.text || '',
      done: !!content.done
    });
  });
  return { familyId: famId, items, membersMap, selfOpenid };
}

module.exports = { loadFamilyFeed };
