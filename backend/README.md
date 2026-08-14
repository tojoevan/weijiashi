# 微家事后端（Cloudflare Workers + D1 + R2）

免费方案：Workers 跑 API、D1 存结构化数据、R2 存图片。无服务器、无备案服务器。

## 1. 准备（你来做）
- **备案域名 your-gateway-domain.example.com**：保留在境内部署（BaoTa/nginx），**不要**加到 Cloudflare；它只做微信合法域名门面 + 隐私页 + 反代。
- **中间层域名（非备案，如 your-cloudflare-domain.example.com）**：在 Cloudflare 添加该域名并把 NS 改过去，作为「中间层组件」承载 Worker（详见 `relay/`）。
- 在 mp.weixin.qq.com → 开发设置 拿到 **AppID** 和 **AppSecret**。
- 本地安装：`npm i -g wrangler` → `wrangler login`。

## 2. 创建资源
```bash
wrangler d1 create jiashiben
wrangler r2 bucket create jiashiben-images
```
把 `jiashiben` 的 **database_id** 填进 `wrangler.toml` 的 `database_id`。
Worker 部署后绑定到中间层域名 `your-cloudflare-domain.example.com`（见 `wrangler.toml` 的 routes，须为非备案域名）。`*.workers.dev` 仅作备用，微信侧不直接访问。

## 3. 建表
```bash
wrangler d1 execute jiashiben --remote --file=./schema.sql
```

## 4. 注入密钥（只走 secret，不进代码）
```bash
wrangler secret put APP_ID
wrangler secret put APP_SECRET
wrangler secret put AUTH_SECRET   # 任意长随机串，用作会话令牌签名
wrangler secret put INTERNAL_KEY  # relay 与 Worker 之间的内部密钥，须与前端 config.INTERNAL_KEY 一致
```

## 5. 部署 + 绑定自定义域
```bash
wrangler deploy
```
部署后在 Cloudflare 控制台确认 Worker 已绑定到中间层域名 `your-cloudflare-domain.example.com`（与 wrangler.toml 的 route 对应）。该域名即 relay 的转发目标，微信侧不直接访问。

## 6. 小程序侧
- mp 后台 → 开发设置 → 服务器域名：把 `https://your-gateway-domain.example.com`（即 relay 地址）加进 **request / downloadFile / uploadFile** 三类合法域名。
- 前端 `store.js` 改为「本地缓存 + 云 API」双写：登录拿 token 存本地，请求带 `Authorization: Bearer <token>`；写操作先本地乐观更新再同步云端，用 `updated_at` 做冲突合并。

## 接口一览
> 表中为 **Worker 端真实路径**。前端经 relay 访问时统一加 `/api` 前缀，由 `your-gateway-domain.example.com/api/* → Worker /*`（relay 自动剥离 `/api`）。

| 方法 | Worker 路径 | 说明 |
|---|---|---|
| POST | `/login` | `{code}` → `{token,openid}` |
| GET/POST/PUT/DELETE | `/todos[/:id]` | 待办增删改查 |
| GET/PUT | `/tasks` | 事务（整份 sections 文档） |
| GET/POST/PUT/DELETE | `/archive[/:id]` | 档案增删改查 |
| GET | `/family/shared` | 当前家庭组的共享项 |
| POST | `/img` | 上传图片到 R2（multipart，`file` 字段） |
| GET | `/img/:key` | 读取图片（公开） |

所有接口（除 `/` 健康检查外）均要求请求头携带 `X-Sync-Key`（relay 与 Worker 共享密钥），否则返回 403。

## 注意
- 免费版**不含中国 CDN**：国内首屏可能偏慢，家庭小应用可接受。
- 图片需在客户端 `wx.compressImage` 压缩后再上传，免费版无服务端裁剪。
- `family_id` / 家庭成员关系目前是数据骨架，共享项的家庭归属需在客户端写入 `shared` 时一并带 `familyId`。

## ⚠️ 合规提醒（重要，部署前必读）

### 已选定方案：境内门面 + 中间层组件（relay + Cloudflare 中间层）
- 微信小程序**只访问** `your-gateway-domain.example.com`（备案域名，境内 BaoTa/nginx 服务器），并在该服务器放隐私政策页满足备案内容要求。
- `your-gateway-domain.example.com` 作为反向代理，把 `/api/*` 转发到 **Cloudflare 中间层组件 `your-cloudflare-domain.example.com`**（独立非备案域名）；真正的 D1/R2 存储在该中间层之后，微信与备案审计都不直接接触 Cloudflare。
- 这样备案审计看到的 `your-gateway-domain.example.com` 始终是纯境内服务器，**内部实现（Cloudflare）被完全解耦**，规避了"整域指向境外"被注销备案的风险。
- 代价：境内中继服务器有少量成本（轻量服务器约 ¥60+/年或国内 Serverless 按量）。

备案域名**必须解析至境内合规服务器**，严禁把 `your-gateway-domain.example.com` 整域或任何子域直接解析到 Cloudflare 全球（境外）节点——接入商定期巡检会比对解析 IP 归属地，发现指向境外会判定"备案信息虚假"并**注销备案**。

采用本「中间层组件」拓扑后，`your-gateway-domain.example.com` **不解析到任何境外 IP**（仅境内服务器 + 隐私页），从根本上满足备案要求；Cloudflare 只出现于「境内服务器 → 中间层域名 your-cloudflare-domain.example.com」这一服务器间的出向调用里。
- 残留灰区：接入商深检可能发现该境内服务器向境外回源。这被广泛用于个人项目，但非 100% 合规；若要求零风险，请改用境内 Serverless（微信云开发 / 阿里云 FC / 腾讯云 SCF）。

若要求彻底无忧，请改用 **微信云开发 / 阿里云 FC / 腾讯云 SCF** 等境内 Serverless，域名接入与备案接入商一致即零备案风险（云开发个人版约 ¥19.9/月）。
