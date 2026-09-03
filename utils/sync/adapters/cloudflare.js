// Cloudflare 适配器（v3 · 经网关 your-gateway-domain.example.com）
// ============================================================
// 安全模型（重要）：
//   前端只持有【网关会话令牌】，绝不持有 INTERNAL_KEY / AppSecret / tenant_id。
//   - 登录：wx.login() -> code -> POST {API_BASE}/api/login -> { token }
//   - 数据：所有请求发往 {API_BASE}/api/data/* ，带上 Authorization: Bearer <token>
//     网关验证会话后，注入 X-Sync-Key + X-User-Id(openid) 并改写为 /t/weijiashi/*
//   请求前先 ensureLogin() 保证带有效令牌（消除冷启动那条 401）；
//   若令牌中途失效（如网关重启换 SESSION_SECRET）仍保留 401 自愈。
// 本地缓存（store）做离线兜底 + 乐观双写。
const store = require('../../store.js');
const config = require('../config.js');
const { STORAGE_KEYS: K } = config;

const API = (config.API_BASE || '').replace(/\/$/, '');

function getToken() { return store.read(K.token) || ''; }
function cacheWrite(key, val) { store.write(key, val); }
function authHeader() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

// ---- 登录：用微信 code 换取网关会话令牌 ----
function loginWithCode(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API + '/api/login',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { code },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
          store.write(K.token, res.data.token);
          resolve(res.data);
        } else {
          reject(new Error('login failed: HTTP ' + res.statusCode + ' ' + JSON.stringify(res.data)));
        }
      },
      fail: reject
    });
  });
}

// 隐私授权：上线后微信要求先弹隐私授权，才能调用 wx.login 等隐私接口（获取 openid）。
// 旧基础库无该 API 时直接放行（隐私未启用）；用户拒绝也放行，避免卡死登录流程。
function privacyAuthorize() {
  return new Promise((resolve) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') return resolve();
    wx.requirePrivacyAuthorize({ success: () => resolve(), fail: () => resolve() });
  });
}

// 去重的登录守卫：已持有令牌则直接放行；否则 先弹隐私授权 -> wx.login -> loginWithCode。
// force=true 时忽略已有令牌，强制重新登录（用于 401 后清除失效令牌，避免被「已登录」短路）。
let loginInFlight = null;
function ensureLogin(force) {
  if (getToken() && !force) return Promise.resolve();
  if (!loginInFlight) {
    loginInFlight = new Promise((resolve, reject) => {
      privacyAuthorize().then(() => {
        wx.login({
          success: (r) => {
            if (!r.code) return reject(new Error('wx.login: no code'));
            loginWithCode(r.code).then(resolve, reject);
          },
          fail: (e) => reject(e)
        });
      }).catch(reject);
    }).finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

// ---- 通用请求：path 是 /api 之后的路径（登录用 /login；数据用 /data/...）----
// 遇到 401 自动重新登录并重试一次，实现「无需改动页面」的无感登录闭环。
function request(method, path, body, _retried) {
  return new Promise((resolve, reject) => {
    const opt = {
      url: API + '/api' + path,
      method,
      header: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        if (res.statusCode === 401 && !_retried) {
          // 令牌可能过期/失效（如网关重启后 SESSION_SECRET 变更），先清除再强制重新登录
          cacheWrite(K.token, '');
          return ensureLogin(true)
            .then(() => request(method, path, body, true).then(resolve, reject))
            .catch(reject);
        }
        reject(new Error('HTTP ' + res.statusCode + ' ' + JSON.stringify(res.data)));
      },
      fail: (e) => reject(e)
    };
    if (body !== undefined) opt.data = body;
    wx.request(opt);
  });
}

// 所有数据请求先确保已登录（拿到有效令牌），避免首屏/冷启动先打一条 401 再自愈的噪音。
// 401 自愈仍保留，处理令牌中途失效（如网关重启换 SESSION_SECRET）的情况。
function authReq(method, path, body) {
  return ensureLogin().then(() => request(method, path, body));
}

const cloudflareAdapter = {
  mode: 'cloudflare',

  // 供 app.js 显式预登录（内部含隐私授权 + wx.login）；也可由 request 内部按需触发
  login(code) {
    return loginWithCode(code);
  },
  preLogin() {
    return ensureLogin();
  },

  // ---- 待办 ----
  // 本地优先：立即返回缓存（首屏秒开），仅当已登录时在后台静默刷新，
  // 避免网关未部署时每次切换页面都卡 ~1s 等待网络超时。
  getTodos() {
    const cached = store.read(K.todos) || [];
    if (getToken()) {
      authReq('GET', '/data/todos')
        .then((list) => { const arr = Array.isArray(list) ? list : []; cacheWrite(K.todos, arr); })
        .catch(() => {});
    }
    return Promise.resolve(cached);
  },
  saveTodo(todo) {
    const list = store.read(K.todos) || [];
    const exists = list.some((t) => t.id === todo.id);
    const next = exists ? store.updateById(list, todo.id, todo) : list.concat([todo]);
    cacheWrite(K.todos, next); // 乐观本地
    // 云端：本地已存在该 id → 视为更新走 PUT；否则直接 POST 创建。
    // 关键：新待办不再先 PUT（会触发数据湖 404），避免每次新建都打一条 404。
    // 若缓存与云端不一致导致 POST 报 404/409/500，再退化为 PUT 更新。
    const op = exists
      ? authReq('PUT', '/data/todos/' + todo.id, todo)
          .catch((e) => ((e.message || '').indexOf('HTTP 404') === 0) ? request('POST', '/data/todos', todo) : Promise.reject(e))
      : authReq('POST', '/data/todos', todo)
          .catch((e) => {
            const m = e.message || '';
            if (m.indexOf('HTTP 404') === 0 || m.indexOf('HTTP 409') === 0 || m.indexOf('HTTP 500') === 0) {
              return request('PUT', '/data/todos/' + todo.id, todo);
            }
            return Promise.reject(e);
          });
    return op.then(() => todo).catch(() => todo); // 离线保留本地
  },
  deleteTodo(id) {
    cacheWrite(K.todos, store.removeById(store.read(K.todos) || [], id));
    return authReq('DELETE', '/data/todos/' + id).then(() => {}).catch(() => {});
  },

  // ---- 事务（按项独立存储，2026-09-03 起替代整篇 sections 文档） ----
  getTasks() {
    const cached = store.read(K.tasks) || [];
    if (getToken()) {
      authReq('GET', '/data/tasks')
        .then((list) => { const arr = Array.isArray(list) ? list : []; cacheWrite(K.tasks, arr); })
        .catch(() => {});
    }
    return Promise.resolve(cached);
  },
  saveTask(task) {
    const list = store.read(K.tasks) || [];
    const exists = list.some((t) => t.id === task.id);
    const next = exists ? store.updateById(list, task.id, task) : list.concat([task]);
    cacheWrite(K.tasks, next); // 乐观本地
    // 云端：本地已存在该 id → PUT 更新；否则 POST 创建。失败按 404/409/500 退化为另一方法。
    const op = exists
      ? authReq('PUT', '/data/tasks/' + task.id, task)
          .catch((e) => ((e.message || '').indexOf('HTTP 404') === 0) ? request('POST', '/data/tasks', task) : Promise.reject(e))
      : authReq('POST', '/data/tasks', task)
          .catch((e) => {
            const m = e.message || '';
            if (m.indexOf('HTTP 404') === 0 || m.indexOf('HTTP 409') === 0 || m.indexOf('HTTP 500') === 0) {
              return request('PUT', '/data/tasks/' + task.id, task);
            }
            return Promise.reject(e);
          });
    return op.then(() => task).catch(() => task); // 离线保留本地
  },
  deleteTask(id) {
    cacheWrite(K.tasks, store.removeById(store.read(K.tasks) || [], id));
    return authReq('DELETE', '/data/tasks/' + id).then(() => {}).catch(() => {});
  },

  // ---- 档案 ----
  getArchive() {
    const cached = store.read(K.archive) || [];
    if (getToken()) {
      authReq('GET', '/data/archive')
        .then((list) => { const arr = Array.isArray(list) ? list : []; cacheWrite(K.archive, arr); })
        .catch(() => {});
    }
    return Promise.resolve(cached);
  },
  saveArchive(item) {
    const list = store.read(K.archive) || [];
    const next = list.some((t) => t.id === item.id) ? store.updateById(list, item.id, item) : list.concat([item]);
    cacheWrite(K.archive, next);
    const op = item.id
      ? authReq('PUT', '/data/archive/' + item.id, item)
          .catch((e) => ((e.message || '').indexOf('HTTP 404') === 0) ? request('POST', '/data/archive', item) : Promise.reject(e))
      : authReq('POST', '/data/archive', item);
    return op.then(() => item).catch(() => item);
  },
  deleteArchive(id) {
    cacheWrite(K.archive, store.removeById(store.read(K.archive) || [], id));
    return authReq('DELETE', '/data/archive/' + id).then(() => {}).catch(() => {});
  },

  // ---- 家庭共享：按当前家庭过滤，合并云端 todos + archive（含其他成员） ----
  // familyId 省略时退化为租户全量（旧单家庭兼容），传入则只取该家庭共享项。
  getShared(familyId) {
    const q = familyId ? ('?family=' + encodeURIComponent(familyId)) : '';
    return authReq('GET', '/data/family/shared' + q).then((r) => {
      const norm = (meta) => (meta && typeof meta === 'object') ? meta : (typeof meta === 'string' ? { text: meta } : {});
      const todos = (r.todos || []).map((t) => ({
        id: t.id,
        type: 'todo',
        title: t.title || '',
        tag: t.tag || '',
        dot: t.dot || 'family',
        owner_openid: t.owner_openid || '',
        co_edit: t.co_edit ? 1 : 0,
        meta: norm(t.meta)
      }));
      const archive = (r.archive || []).map((a) => {
        const p = (a.payload && typeof a.payload === 'object') ? a.payload : {};
        return {
          id: a.id,
          type: 'archive',
          title: p.title || a.id,
          tag: p.tag || '',
          dot: 'family',
          owner_openid: a.owner_openid || '',
          co_edit: a.co_edit ? 1 : 0,
          payload: p
        };
      });
      const tasks = (r.tasks || []).map((t) => ({
        id: t.id,
        type: 'task',
        title: t.title || '',
        tag: t.tag || '',
        dot: t.dot || 'family',
        owner_openid: t.owner_openid || '',
        co_edit: t.co_edit ? 1 : 0,
        room: t.room || '',
        meta: norm(t.meta)
      }));
      return todos.concat(tasks).concat(archive);
    }).catch(() => {
      // 离线回退：仅本机 shared=true 的项，结构同上
      const norm = (meta) => (meta && typeof meta === 'object') ? meta : (typeof meta === 'string' ? { text: meta } : {});
      const todos = (store.read(K.todos) || []).filter((t) => t.shared).map((t) => ({
        id: t.id, type: 'todo', title: t.title || '', tag: t.tag || '',
        dot: t.dot || 'family', owner_openid: '', co_edit: 0, meta: norm(t.meta)
      }));
      const tasks = (store.read(K.tasks) || []).filter((t) => t.shared).map((t) => ({
        id: t.id, type: 'task', title: t.title || '', tag: t.tag || '',
        dot: t.dot || 'family', owner_openid: '', co_edit: 0, room: t.room || '', meta: norm(t.meta)
      }));
      return todos.concat(tasks);
    });
  },

  // ---- 图片：经网关上传到 R2（multipart /file 字段） ----
  uploadImage(tempFilePath) {
    return ensureLogin().then(() => new Promise((resolve, reject) => {
      wx.uploadFile({
        url: API + '/api/data/img',
        filePath: tempFilePath,
        name: 'file',
        header: authHeader(),
        success: (res) => {
          try {
            const r = JSON.parse(res.data); // { ok, key, url }
            resolve(r);
          } catch (e) { reject(e); }
        },
        fail: reject
      });
    }));
  },
  // 由存库的 key（裸 key 或数据湖 url /t/<tenant>/img/<key>）生成可访问的网关地址
  getImageUrl(key) {
    if (!key) return '';
    if (/^https?:\/\//.test(key)) return key;
    if (key.indexOf('/t/') === 0) return API + '/api/data' + key.slice(key.indexOf('/img/'));
    if (key.indexOf('/img/') === 0) return API + '/api/data' + key;
    return API + '/api/data/img/' + key;
  },

  // ---- 家庭（多家庭模型，每人最多 3 个）----
  // 全部走网关 /api/family/*（authReq 已带会话令牌，网关注入 openid）。
  familyCreate(name, nickname) {
    return authReq('POST', '/family', { name: name || '我的家庭', nickname: nickname || '' });
  },
  familyMine() {
    return authReq('GET', '/family/mine');
  },
  familyInvite(familyId) {
    return authReq('POST', '/family/invite', { family_id: familyId });
  },
  familyInviteInfo(code) {
    return authReq('GET', '/family/invite/info?code=' + encodeURIComponent(code));
  },
  familyAccept(code, nickname) {
    return authReq('POST', '/family/accept', { code, nickname: nickname || '' });
  },
  familyMembers(familyId) {
    return authReq('GET', '/family/members?family_id=' + encodeURIComponent(familyId));
  },
  familyLeave(familyId) {
    return authReq('POST', '/family/leave', { family_id: familyId });
  },
  familyTransfer(familyId, toOpenid) {
    return authReq('POST', '/family/transfer', { family_id: familyId, to_openid: toOpenid });
  },
  familySetNickname(familyId, nickname) {
    return authReq('POST', '/family/nickname', { family_id: familyId, nickname: nickname || '' });
  },
  // 所有者切换某共享项的协作编辑开关（co_edit）
  setItemPerm(id, coEdit) {
    return authReq('POST', '/data/family/shared/perm', { id, co_edit: coEdit ? 1 : 0 });
  },
  // 家庭成员勾选/取消完成（仅对共享待办开放，与内容编辑解耦）
  setItemDone(id, done) {
    return authReq('POST', '/data/family/shared/done', { id, done: done ? 1 : 0 });
  },

  // ---- 用户数据主权（个保法/GDPR 合规）----
  // 导出本人全部云端数据明文（服务端按 openid 隔离，仅返回本人数据）
  exportMyData() {
    return authReq('GET', '/data/me/export');
  },
  // 注销并删除本人全部云端数据（高危，调用方须二次确认）
  deleteMyAccount() {
    return authReq('DELETE', '/data/me');
  }
};

module.exports = cloudflareAdapter;
