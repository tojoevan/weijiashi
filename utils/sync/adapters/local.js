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

  // ---- 事务（整份 sections 文档） ----
  getSections() {
    return Promise.resolve(store.read(K.sections) || []);
  },
  saveSections(sections) {
    store.write(K.sections, sections);
    return Promise.resolve(sections);
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

  // ---- 家庭共享：收集本地 shared=true 的项 ----
  getShared() {
    const todos = store.read(K.todos) || [];
    const sections = store.read(K.sections) || [];
    const out = [];
    todos.forEach(t => { if (t.shared) out.push(Object.assign({ __type: 'todo' }, t)); });
    sections.forEach(sec => (sec.items || []).forEach(it => {
      if (it.shared) out.push(Object.assign({ __type: 'task', __section: sec.title }, it));
    }));
    return Promise.resolve(out);
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
  }
};

module.exports = localAdapter;
