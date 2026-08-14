# 境内中继（反向代理）部署指南 · BaoTa(宝塔) 版

`your-gateway-domain.example.com` 是你已**备案**的域名，绑定在境内部署了 BaoTa + nginx 的服务器上。
它对外只做两件事：

1. 根路径 `/` 提供**隐私政策页**（满足备案"站点需有实际内容"要求）。
2. `/api/*` 反向代理到 Cloudflare Worker（真正的 D1/R2 存储在 CF 后，不暴露给微信，故 CF 侧无需备案）。

---

## 步骤 1 — BaoTa 建站并签发 SSL

1. BaoTa → **网站** → **添加站点**，域名填 `your-gateway-domain.example.com`，根目录默认 `/www/wwwroot/your-gateway-domain.example.com`。
2. 域名解析：在域名注册商/DNS 处把 `your-gateway-domain.example.com` 的 **A 记录**指向这台**境内部署服务器**的公网 IP（必须是大陆 IP，否则备案作废）。
3. BaoTa → 该站点 → **SSL** → 申请 **Let's Encrypt** 免费证书并强制 HTTPS。

> ⚠️ 这台服务器必须位于中国大陆，且 IP 与备案主体一致，否则接入商巡检会注销备案。

## 步骤 2 — 上传隐私页

把同目录的 `index.html` 上传到 `/www/wwwroot/your-gateway-domain.example.com/index.html`。
访问 `https://your-gateway-domain.example.com/` 应能看到隐私政策页。

## 步骤 3 — 加入 /api 反向代理

BaoTa → 该站点 → **设置** → **配置文件**，在 `listen 443` 的 server 块内，
**保留已有的 SSL 与 `location /`**，再**新增**下面这段（放在 `location /` 之前或之后均可，nginx 按最长前缀匹配，`/api/` 优先）：

```nginx
location /api/ {
    proxy_pass https://your-cloudflare-domain.example.com/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization     $http_authorization;
    proxy_set_header X-Sync-Key        $http_x_sync_key;
    proxy_ssl_server_name on;
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}
```

**把 `your-cloudflare-domain.example.com` 换成你的 Cloudflare 中间层域名**（即在 `wrangler.toml` 的 `routes.pattern` 中绑定的非备案域名；小程序不会直接访问它，`your-gateway-domain.example.com` 才是微信侧的合法域名）。

保存后 BaoTa 会自动重载 nginx。

## 步骤 4 — 校验

```bash
# 1) 隐私页可达
curl -sI https://your-gateway-domain.example.com/ | head -1
# 期望：HTTP/2 200

# 2) 无密钥访问 API → 应被 Worker 拒绝 403
curl -sI https://your-gateway-domain.example.com/api/login -X POST
# 期望：HTTP/2 403

# 3) 带正确内部密钥（与 wrangler secret INTERNAL_KEY / 前端 config.INTERNAL_KEY 一致）→ 进入登录逻辑
curl -sI https://your-gateway-domain.example.com/api/login -X POST -H "X-Sync-Key: <你的INTERNAL_KEY>" -H "content-type: application/json" -d '{"code":"x"}'
# 期望：HTTP/2 401（login_failed，说明密钥校验已通过、进入了微信换 openid 逻辑）
```

## 步骤 5 — 小程序后台配置

mp.weixin.qq.com → 开发 → 开发设置 → **服务器域名**，把下面三个都加 `https://your-gateway-domain.example.com`：
- **request 合法域名**
- **downloadFile 合法域名**（图片读取走 /api/img）
- **uploadFile 合法域名**（图片上传走 /api/img）

> 开发联调阶段可先勾选「不校验合法域名 / TLS 版本」，用真机或模拟器快速验证。

## 密钥一致性（务必三者相同）

| 位置 | 值 |
|---|---|
| 前端 `utils/sync/config.js` → `INTERNAL_KEY` | 你设定的密钥 |
| `wrangler secret put INTERNAL_KEY` | 同一密钥 |
| nginx relay 不存密钥，仅**透传**客户端发来的 `X-Sync-Key` | — |

relay 本身不校验密钥，它只负责转发；真正的校验在 Worker 端（见 `backend/src/index.js` 的 `app.use('*')` 守卫）。这样即便 Worker 地址泄露，没有密钥也无法调用。
