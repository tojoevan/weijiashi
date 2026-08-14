-- 微家事 D1 表结构
-- 执行：wrangler d1 execute jiashiben --remote --file=./schema.sql

-- 待办（today 页的待办项，行级存储）
CREATE TABLE IF NOT EXISTS todos (
  id            TEXT PRIMARY KEY,
  owner_openid  TEXT NOT NULL,
  data          TEXT NOT NULL,        -- 完整 JSON：{title,meta,tag,dot,shared}
  shared        INTEGER DEFAULT 0,
  family_id     TEXT,
  updated_at    INTEGER NOT NULL
);

-- 事务（tasks 页：整份 sections 数组作为一个文档，按用户存）
CREATE TABLE IF NOT EXISTS tasks_doc (
  owner_openid  TEXT PRIMARY KEY,
  data          TEXT NOT NULL,        -- sections 数组 JSON
  updated_at    INTEGER NOT NULL
);

-- 档案（archive 物品，行级存储）
CREATE TABLE IF NOT EXISTS archive_items (
  id            TEXT PRIMARY KEY,
  owner_openid  TEXT NOT NULL,
  data          TEXT NOT NULL,        -- 完整 JSON：{name,buyDate,warranty,note,photo}
  shared        INTEGER DEFAULT 0,
  family_id     TEXT,
  updated_at    INTEGER NOT NULL
);

-- 家庭组
CREATE TABLE IF NOT EXISTS family_groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_openid  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- 家庭成员（openid 关系）
CREATE TABLE IF NOT EXISTS family_members (
  group_id      TEXT NOT NULL,
  openid        TEXT NOT NULL,
  role          TEXT DEFAULT 'member',
  joined_at     INTEGER NOT NULL,
  PRIMARY KEY (group_id, openid)
);

CREATE INDEX IF NOT EXISTS idx_todos_owner ON todos(owner_openid);
CREATE INDEX IF NOT EXISTS idx_archive_owner ON archive_items(owner_openid);
