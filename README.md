# 微家事（weijiashi）

> 个人与家庭的待办 / 事务 / 档案管理微信小程序。
> **默认纯本地运行，克隆即用，无需任何服务器**；可选接入云端同步与家庭共享。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## ✨ 功能特性

- **待办**：今日待办，支持时间、标签、空间（个人 / 家庭）、提醒。
- **事务**：按物品 / 主题归并的持续性事项（如家电保养、订阅续费、车辆保养）。
- **档案**：家庭物品档案（购入日期、保修期等）。
- **全局搜索**：跨待办、事务、档案、家庭成员一键检索。
- **家庭成员**：邀请微信好友加入，设置角色（管理员 / 成员）。
- **多主题**：浅色 / 深色等外观切换。
- **本地优先**：数据存于本地，离线可用；可叠加云端同步做家庭共享。

---

## 🏗 架构

```
┌─────────────────────┐
│   微信小程序（前端）   │  原生小程序，本地 Storage 存数据
└──────────┬──────────┘
           │  （可选）云端同步
           ▼
┌──────────────────────────────┐
│  境内备案网关（your-gateway-   │  微信合法域名门面 + 隐私页 + 反向代理
│  domain.example.com）         │  持有 AppID/AppSecret，签发会话
└──────────┬───────────────────┘
           │  REST（服务端，X-Sync-Key 鉴权）
           ▼
┌──────────────────────────────┐
│  Cloudflare 数据湖            │  Workers + D1（结构化）+ R2（图片）
│  （your-cloudflare-domain.    │  按 tenant_id 多租户隔离
│  example.com）               │
└──────────────────────────────┘
```

- **默认纯本地**：不启用云端时，所有数据留在小程序本地，不经过任何服务器。
- **安全模型**：前端只持有「网关会话令牌」，**绝不**持有 `INTERNAL_KEY` / `AppSecret` / `tenant_id`；这些机密仅存在于服务端，由网关在转发时注入。

---

## 📁 目录结构

```
.
├── app.js / app.json / app.wxss   # 小程序入口与全局样式
├── assets/                        # SVG 图标
├── pages/                         # 各页面（today/tasks/archive/mine/search/family/edit…）
├── utils/                         # 工具层
│   ├── store.js                   # 本地存储
│   ├── family.js                  # 家庭成员（本地优先、云就绪）
│   ├── icons.js / theme.js / profile.js
│   └── sync/                      # 同步层
│       ├── config.js              # 云端开关与网关地址（纯本地留空）
│       ├── index.js               # 同步接口
│       └── adapters/              # local（默认）/ cloudflare 适配器
├── backend/                       # 可选云端后端（Cloudflare）
│   ├── src/index.js               # Worker：D1 + R2 + 多租户
│   ├── relay/                     # 境内 nginx 反代参考配置
│   ├── schema.sql                 # 建表
│   ├── wrangler.toml
│   └── README.md                  # 后端部署指南
├── project.config.example.json    # 开发者工具配置模板（替换为你自己的 AppID）
├── LICENSE
└── README.md
```

---

## 🚀 本地运行（纯本地，零配置）

1. 克隆仓库：
   ```bash
   git clone https://github.com/tojoevan/weijiashi.git
   cd weijiashi
   ```
2. 打开**微信开发者工具** → 导入项目 → 选择本仓库目录。
3. AppID 填你自己的小程序 AppID；或参考 `project.config.example.json` 用测试号。
4. 直接编译运行。**默认 `CLOUD_ENABLED = false`，纯本地模式，无需任何后端。**

> 纯本地模式下，待办 / 事务 / 档案 / 家庭成员均存于本机，换设备不互通。

---

## ☁️ 启用云端同步与家庭共享

首次 clone 后，先复制配置模板（真实配置文件不入库，缺失会导致小程序无法启动）：

```bash
cp utils/sync/config.example.js utils/sync/config.js
```

然后编辑 `utils/sync/config.js`：

```js
module.exports = {
  CLOUD_ENABLED: true,                                  // 开启云端
  API_BASE: 'https://your-gateway-domain.example.com',  // 你的境内备案网关
  // ...
};
```

然后按 `backend/README.md` 部署后端（境内网关 + Cloudflare 数据湖）。

> ⚠️ 部署涉及 ICP 备案与合规要求，详见 `backend/README.md` 的「合规提醒」一节。

---

## 🔧 后端部署（可选）

后端位于 `backend/`，包含 Cloudflare Worker（`src/index.js`）与境内反代参考配置（`relay/`）：

- 数据湖：Cloudflare Workers + D1 + R2，免费额度充足。
- 网关：境内备案域名做微信合法域名门面 + 隐私页 + 反代。
- 密钥通过 `wrangler secret put` 注入，参考 `backend/.dev.vars.example`。

完整步骤见 **[backend/README.md](./backend/README.md)**。

---

## 🔐 安全与脱敏

本项目面向开源，仓库内**不包含任何真实域名、AppID 或密钥**：

- 所有域名在文档 / 配置中以占位符表示（`your-gateway-domain.example.com`、`your-cloudflare-domain.example.com`）。
- 微信 `AppID` 仅在你的本地 `project.config.json`（已加入 `.gitignore`）中。
- 网关地址仅在你的本地 `utils/sync/config.js`（已加入 `.gitignore`）中；仓库只提供模板 `utils/sync/config.example.js`。
- 密钥（`INTERNAL_KEY` / `APP_SECRET` / `AUTH_SECRET`）一律通过环境变量 / `wrangler secret` 注入，不进代码。

> 这两个本地文件不入库，所以 clone 后必须各自重建，否则小程序无法运行。

---

## 📄 开源协议

[MIT](./LICENSE) —— 可自由用于学习、二次开发与商用，请保留版权声明。

---

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。提交前请确保：

- 不向仓库提交任何真实域名、AppID、密钥（使用占位符）。
- 遵循现有代码风格与目录结构。

---

## 📌 版本约定

版本号采用 `X.Y.Z`（每段单数字，**遇 9 进位**，如 `0.0.9 → 0.1.0`）：
- `Z`：修复 / 小改
- `Y`：功能迭代
- `X`：大版本重构
