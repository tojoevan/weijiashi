import { Hono } from 'hono'

const app = new Hono()

// ---------- 工具：Base64 / HMAC 会话令牌 ----------
const enc = (s) => new TextEncoder().encode(s)
const b64 = (s) => btoa(unescape(encodeURIComponent(s)))
const b64d = (s) => decodeURIComponent(escape(atob(s)))

async function hmac(msg, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function makeToken(openid, secret) {
  const payload = b64(JSON.stringify({ o: openid, t: Date.now() }))
  return `${payload}.${await hmac(payload, secret)}`
}
async function verifyToken(token, secret) {
  if (!token) return null
  const [p, s] = token.split('.')
  if (!p || !s || (await hmac(p, secret)) !== s) return null
  try { return JSON.parse(b64d(p)).o } catch { return null }
}
const getToken = (c) => (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '') || null
async function requireOpenid(c, next) {
  const openid = await verifyToken(getToken(c), c.env.AUTH_SECRET)
  if (!openid) return c.json({ error: 'unauthorized' }, 401)
  c.set('openid', openid)
  await next()
}

// 内部鉴权：relay 与 Worker 之间必须携带共享密钥 X-Sync-Key，否则拒绝。
// 即便 Worker 公网地址（xxx.workers.dev）泄露，没有密钥也无法调用，避免被直接刷接口。
app.use('*', async (c, next) => {
  if (c.req.path === '/') return next() // 健康检查放行
  if (c.req.header('X-Sync-Key') !== c.env.INTERNAL_KEY) {
    return c.json({ error: 'forbidden' }, 403)
  }
  await next()
})

// 微信 code2session 换取 openid
async function code2session(code, env) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${env.APP_ID}&secret=${env.APP_SECRET}&js_code=${code}&grant_type=authorization_code`
  const j = await (await fetch(url)).json()
  return j.openid || null
}

// ---------- 鉴权：登录 ----------
app.post('/login', async (c) => {
  const { code } = await c.req.json().catch(() => ({}))
  const openid = await code2session(code, c.env)
  if (!openid) return c.json({ error: 'login_failed' }, 401)
  return c.json({ token: await makeToken(openid, c.env.AUTH_SECRET), openid })
})

// ---------- 待办 todos ----------
app.get('/todos', requireOpenid, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT data FROM todos WHERE owner_openid=? ORDER BY updated_at DESC').bind(c.get('openid')).all()
  return c.json(results.map((r) => JSON.parse(r.data)))
})
app.post('/todos', requireOpenid, async (c) => {
  const item = await c.req.json().catch(() => ({}))
  const id = item.id || crypto.randomUUID()
  const shared = item.shared ? 1 : 0
  const data = JSON.stringify({ id, title: item.title || '', meta: item.meta || '', tag: item.tag || '', dot: item.dot || 'brand', shared: !!item.shared })
  const ts = Date.now()
  await c.env.DB.prepare('INSERT OR REPLACE INTO todos (id,owner_openid,data,shared,family_id,updated_at) VALUES (?,?,?,?,?,?)').bind(id, c.get('openid'), data, shared, null, ts).run()
  return c.json({ id, updatedAt: ts })
})
app.put('/todos/:id', requireOpenid, async (c) => {
  const id = c.req.param('id')
  const item = await c.req.json().catch(() => ({}))
  const shared = item.shared ? 1 : 0
  const data = JSON.stringify({ id, title: item.title || '', meta: item.meta || '', tag: item.tag || '', dot: item.dot || 'brand', shared: !!item.shared })
  const ts = Date.now()
  await c.env.DB.prepare('UPDATE todos SET data=?, shared=?, updated_at=? WHERE id=? AND owner_openid=?').bind(data, shared, ts, id, c.get('openid')).run()
  return c.json({ id, updatedAt: ts })
})
app.delete('/todos/:id', requireOpenid, async (c) => {
  await c.env.DB.prepare('DELETE FROM todos WHERE id=? AND owner_openid=?').bind(c.req.param('id'), c.get('openid')).run()
  return c.json({ ok: true })
})

// ---------- 事务 tasks（整份 sections 文档按用户存） ----------
app.get('/tasks', requireOpenid, async (c) => {
  const row = await c.env.DB.prepare('SELECT data FROM tasks_doc WHERE owner_openid=?').bind(c.get('openid')).first()
  return c.json(row ? JSON.parse(row.data) : [])
})
app.put('/tasks', requireOpenid, async (c) => {
  const sections = await c.req.json().catch(() => [])
  const ts = Date.now()
  await c.env.DB.prepare('INSERT OR REPLACE INTO tasks_doc (owner_openid,data,updated_at) VALUES (?,?,?)').bind(c.get('openid'), JSON.stringify(sections), ts).run()
  return c.json({ updatedAt: ts })
})

// ---------- 档案 archive_items ----------
app.get('/archive', requireOpenid, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT data FROM archive_items WHERE owner_openid=? ORDER BY updated_at DESC').bind(c.get('openid')).all()
  return c.json(results.map((r) => JSON.parse(r.data)))
})
app.post('/archive', requireOpenid, async (c) => {
  const item = await c.req.json().catch(() => ({}))
  const id = item.id || crypto.randomUUID()
  const shared = item.shared ? 1 : 0
  const data = JSON.stringify({ id, name: item.name || '', buyDate: item.buyDate || '', warranty: item.warranty || '', note: item.note || '', photo: item.photo || '', shared: !!item.shared })
  const ts = Date.now()
  await c.env.DB.prepare('INSERT OR REPLACE INTO archive_items (id,owner_openid,data,shared,family_id,updated_at) VALUES (?,?,?,?,?,?)').bind(id, c.get('openid'), data, shared, null, ts).run()
  return c.json({ id, updatedAt: ts })
})
app.put('/archive/:id', requireOpenid, async (c) => {
  const id = c.req.param('id')
  const item = await c.req.json().catch(() => ({}))
  const shared = item.shared ? 1 : 0
  const data = JSON.stringify({ id, name: item.name || '', buyDate: item.buyDate || '', warranty: item.warranty || '', note: item.note || '', photo: item.photo || '', shared: !!item.shared })
  const ts = Date.now()
  await c.env.DB.prepare('UPDATE archive_items SET data=?, shared=?, updated_at=? WHERE id=? AND owner_openid=?').bind(data, shared, ts, id, c.get('openid')).run()
  return c.json({ id, updatedAt: ts })
})
app.delete('/archive/:id', requireOpenid, async (c) => {
  await c.env.DB.prepare('DELETE FROM archive_items WHERE id=? AND owner_openid=?').bind(c.req.param('id'), c.get('openid')).run()
  return c.json({ ok: true })
})

// ---------- 家庭共享：收集当前用户所在家庭的共享项 ----------
async function myGroupIds(db, openid) {
  const { results } = await db.prepare('SELECT group_id FROM family_members WHERE openid=?').bind(openid).all()
  return results.map((r) => r.group_id)
}
app.get('/family/shared', requireOpenid, async (c) => {
  const oid = c.get('openid')
  const groups = await myGroupIds(c.env.DB, oid)
  const out = { todos: [], archive: [] }
  if (groups.length) {
    const ph = groups.map(() => '?').join(',')
    const t = await c.env.DB.prepare(`SELECT data FROM todos WHERE shared=1 AND family_id IN (${ph})`).bind(...groups).all()
    const a = await c.env.DB.prepare(`SELECT data FROM archive_items WHERE shared=1 AND family_id IN (${ph})`).bind(...groups).all()
    out.todos = t.results.map((r) => JSON.parse(r.data))
    out.archive = a.results.map((r) => JSON.parse(r.data))
  }
  return c.json(out)
})

// ---------- 图片（R2）：上传需登录，读取公开 ----------
app.post('/img', requireOpenid, async (c) => {
  const form = await c.req.parseBody({ all: true })
  const file = form['file']
  if (!file) return c.json({ error: 'no_file' }, 400)
  const key = `${c.get('openid')}/${crypto.randomUUID()}.jpg`
  await c.env.BUCKET.put(key, file, { httpMetadata: { contentType: 'image/jpeg' } })
  return c.json({ key, url: `/img/${key}` })
})
app.get('/img/:key', async (c) => {
  const obj = await c.env.BUCKET.get(c.req.param('key'))
  if (!obj) return c.body(null, 404)
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'public, max-age=86400' } })
})

app.get('/', (c) => c.json({ ok: true, svc: 'jiashiben-api' }))

export default app
