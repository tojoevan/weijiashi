// ============================================================
// 微家事 · 可选云同步组件配置【模板】
// ------------------------------------------------------------
// 用法：复制本文件为同目录下的 config.js，再按需填写。
//   cp utils/sync/config.example.js utils/sync/config.js
//
// 为什么需要这一步：config.js 含真实网关地址，已加入 .gitignore，
// 不会进版本库（仓库承诺不含任何真实域名）。因此 clone 下来后
// 本文件是模板，必须复制一份才能运行。
//
// 默认【纯本地】运行（CLOUD_ENABLED = false），克隆即可用，无需任何服务器。
// 启用云端同步 / 家庭共享时：
//   1) 把 CLOUD_ENABLED 改为 true
//   2) 把 API_BASE 填成你的网关地址（备案域名）
//
// 安全说明（重要）：前端【绝不】持有 INTERNAL_KEY / AppSecret / tenant_id。
// 这些机密只存在于服务端（网关和数据湖），由网关在转发时注入。
// ============================================================
module.exports = {
  // 是否启用云端同步（false = 纯本地；true = 经网关）
  CLOUD_ENABLED: false,

  // 网关根地址（备案域名绑定的服务器）
  // 适配器会自动拼接 /api/login 与 /api/data/*，这里填根地址即可。
  API_BASE: '',  // 纯本地模式留空；启用云端时填你的网关地址，例如 https://your-gateway-domain.example.com

  // 本地存储键（一般无需修改）
  STORAGE_KEYS: {
    todos: 'js_todos_today',
    sections: 'js_sections_tasks',
    archive: 'js_archive_items',
    token: 'js_cloud_token'
  }
};
