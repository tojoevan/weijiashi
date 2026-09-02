// 本地适配器：默认实现，直接复用 utils/store.js，无任何网络请求。
// 所有方法返回 Promise，与云端适配器保持同一签名，便于无缝切换。
const store = require('../../store.js');
const { STORAGE_KEYS: K } = require('../config.js');

function upsert(list, item) {
  if (!list || !list.length) return [item];
  if (list.some(t => t.id === item.id)) return store.updateById(list, item.id, item);
  return list.concat([item]);
}

const localAdapter = {
  mode: 'local',

  // ---- 待办 ----
  getTodos() {
    return Promise.resolve(store.read(K.todos) || []);
  },
  saveTodo(todo) {
    const next = upsert(store.read(K.todos) || [], todo);
    store.write(K.todos, next);
    return Promise.resolve(todo);
  },
  deleteTodo(id) {
    store.write(K.todos, store.removeById(store.read(K.todos) || [], id));
    return Promise.resolve();
  },

  // ---- 事务（按项独立存储，2026-09-03 起替代整篇 sections 文档） ----
  getTasks() {
    return Promise.resolve(store.read(K.tasks) || []);
  },
  saveTask(task) {
    const next = upsert(store.read(K.tasks) || [], task);
    store.write(K.tasks, next);
    return Promise.resolve(task);
  },
  deleteTask(id) {
    store.write(K.tasks, store.removeById(store.read(K.tasks) || [], id));
    return Promise.resolve();
  },

  // ---- 档案 ----
  getArchive() {
    return Promise.resolve(store.read(K.archive) || []);
  },
  saveArchive(item) {
    const next = upsert(store.read(K.archive) || [], item);
    store.write(K.archive, next);
    return Promise.resolve(item);
  },
  deleteArchive(id) {
    store.write(K.archive, store.removeById(store.read(K.archive) || [], id));
    return Promise.resolve();
  },

  // ---- 家庭共享：收集本地 shared=true 的项（结构同云端） ----
  getShared(familyId) {
    const norm = (meta) => (meta && typeof meta === 'object') ? meta : (typeof meta === 'string' ? { text: meta } : {});
    const todos = (store.read(K.todos) || []).filter(t => t.shared).map(t => ({
      id: t.id, type: 'todo', title: t.title || '', tag: t.tag || '',
      dot: t.dot || 'family', owner_openid: '', co_edit: 0, meta: norm(t.meta)
    }));
    const tasks = (store.read(K.tasks) || []).filter(t => t.shared).map(t => ({
      id: t.id, type: 'task', title: t.title || '', tag: t.tag || '',
      dot: t.dot || 'family', owner_openid: '', co_edit: 0, room: t.room || '', meta: norm(t.meta)
    }));
    return Promise.resolve(todos.concat(tasks));
  },

  // ---- 账号 / 图片（本地模式不支持） ----
  login() {
    return Promise.resolve({ token: '', openid: '' });
  },
  uploadImage() {
    return Promise.reject(new Error('本地模式不支持图片上传，请启用云同步（CLOUD_ENABLED=true）'));
  },
  getImageUrl(key) {
    return key || '';
  },
  // 本地模式无跨成员共享，协作开关/完成切换均为空操作（保持签名一致）
  setItemPerm() { return Promise.resolve({ ok: true }); },
  setItemDone() { return Promise.resolve({ ok: true }); }
};

module.exports = localAdapter;
