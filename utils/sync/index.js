// SyncManager：可选云同步中间层的统一入口。
// 默认使用本地适配器；CLOUD_ENABLED=true 时切换为 Cloudflare 适配器。
// 页面只依赖本文件暴露的统一 Promise 接口，不关心底层是本地还是云端。
const config = require('./config.js');
const local = require('./adapters/local.js');

function loadAdapter() {
  if (config.CLOUD_ENABLED) {
    try {
      return require('./adapters/cloudflare.js'); // Phase 1 实现
    } catch (e) {
      console.warn('[sync] 已启用云端但未找到 cloudflare 适配器，回退本地模式。', e);
      return local;
    }
  }
  return local;
}

const adapter = loadAdapter();

// 对外暴露：模式标识 + 配置 + 适配器全部方法
module.exports = Object.assign({
  mode: adapter.mode,
  enabled: config.CLOUD_ENABLED,
  config,
  _adapter: adapter
}, adapter);
