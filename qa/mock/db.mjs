// 모의 Supabase 의 데이터 층 — 메모리 테이블 + PostgREST 질의 의미론 + RLS/가드 트리거 흉내.
// 목적은 「앱이 실제로 보내는 질의 모양」을 그대로 받아 주는 것이다. 지원 범위는 앱이 쓰는 것에 맞춘다:
//   select(컬럼·to-one 임베드·!inner) · eq/neq/gt/gte/lt/lte/like/ilike/is/in/not · order · limit · offset
//   insert/upsert(on_conflict, ignore/merge) · update · delete · return=representation · count=exact · single/maybeSingle
//   RLS: 마이그레이션의 정책과 가드 트리거(allow-list)를 역할(service_role / authenticated 관리자·의뢰인 / anon)별로 흉내
import { randomUUID } from "node:crypto";

export class DbError extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
  toJSON() {
    return { code: this.code, message: this.message, details: this.details, hint: this.hint };
  }
}

const now = () => new Date().toISOString();
const uuid = () => randomUUID();

const ENUM = {
  support_tier: ["self", "assisted"],
  project_status: ["onboarding", "building", "delivered", "closed"],
  owner_side: ["client", "agency"],
  verify_type: ["manual", "github", "vercel", "supabase"],
  step_status: ["todo", "doing", "client_done", "verified", "blocked", "skipped", "returned"],
  author_side: ["admin", "client"],
  comment_kind: ["question", "request"],
  notice_kind: [
    "credentials", "next_step", "step_added", "rerequest", "reminder", "escalation", "digest",
    "admin_replied", "scope_ready", "link_pinned", "closed",
    "client_event", "verify_event", "token_event", "push_test", "preflight",
  ],
  notice_channel: ["push", "outbox"],
  notice_status: ["claimed", "pending", "sent", "failed", "skipped", "superseded"],
  skip_reason: ["admin", "condition_cleared", "cap"],
};

const col = (extra = {}) => ({ ...extra });
const common = () => ({
  id: col({ default: uuid }),
  created_at: col({ default: now }),
  updated_at: col({ default: now }),
});

// 테이블 정의 — 컬럼 기본값·not null·check·unique·FK(cascade)·임베드 관계
export const TABLES = {
  admins: {
    columns: {
      ...common(),
      email: col({ notNull: true }),
      last_tick_started_at: col(),
      last_tick_finished_at: col(),
      last_token_check_at: col(),
    },
    unique: [["email"]],
  },
  projects: {
    columns: {
      ...common(),
      code: col({ notNull: true }),
      name: col({ notNull: true }),
      client_name: col({ notNull: true }),
      client_email: col({ notNull: true }),
      support_tier: col({ default: "assisted", enum: "support_tier" }),
      status: col({ default: "onboarding", enum: "project_status" }),
      github_org: col(),
      vercel_team: col(),
      supabase_org: col(),
      domain: col(),
      scope_md: col(),
      scope_agreed_at: col(),
      closed_at: col(),
      access_sent_at: col(),
      remind_paused_until: col(),
    },
    unique: [["code"]],
  },
  project_guests: {
    columns: {
      ...common(),
      project_id: col({ notNull: true, fk: "projects" }),
      email: col({ notNull: true }),
      last_seen_at: col(),
    },
    unique: [["project_id", "email"]],
    relations: { projects: { table: "projects", via: "project_id" } },
  },
  steps: {
    columns: {
      ...common(),
      project_id: col({ notNull: true, fk: "projects" }),
      order_index: col({ default: 0 }),
      key: col({ notNull: true }),
      title: col({ notNull: true }),
      description_md: col({ default: "" }),
      owner_side: col({ notNull: true, enum: "owner_side" }),
      verify_type: col({ default: "manual", enum: "verify_type" }),
      status: col({ default: "todo", enum: "step_status" }),
      checked_at: col(),
      verified_at: col(),
      verify_result: col(),
      blocked_reason: col(),
    },
    unique: [["project_id", "key"]],
    checks: [
      (row) => row.status !== "blocked" || row.blocked_reason != null
        ? null
        : 'new row for relation "steps" violates check constraint "steps_check"',
    ],
    relations: { projects: { table: "projects", via: "project_id" } },
  },
  links: {
    columns: {
      ...common(),
      project_id: col({ notNull: true, fk: "projects" }),
      order_index: col({ default: 0 }),
      label: col({ notNull: true }),
      url: col({ notNull: true }),
      is_pinned: col({ default: false }),
    },
    unique: [],
    relations: { projects: { table: "projects", via: "project_id" } },
  },
  comments: {
    columns: {
      ...common(),
      project_id: col({ notNull: true, fk: "projects" }),
      step_id: col({ fk: "steps" }),
      author_side: col({ notNull: true, enum: "author_side" }),
      kind: col({ notNull: true, enum: "comment_kind" }),
      body: col({ notNull: true }),
      read_at: col(),
      deleted_at: col(),
    },
    unique: [],
    relations: { projects: { table: "projects", via: "project_id" }, steps: { table: "steps", via: "step_id" } },
  },
  notices: {
    columns: {
      ...common(),
      project_id: col({ fk: "projects" }),
      step_id: col({ fk: "steps" }),
      kind: col({ notNull: true, enum: "notice_kind" }),
      channel: col({ notNull: true, enum: "notice_channel" }),
      dedupe_key: col({ notNull: true }),
      status: col({ notNull: true, enum: "notice_status" }),
      title: col(),
      body: col(),
      skip_reason: col({ enum: "skip_reason" }),
      claimed_at: col(),
      sent_at: col(),
      acked_at: col(),
      day_kst: col({ notNull: true }),
      detail: col(),
    },
    unique: [["dedupe_key"]],
    // notices_daily_cap_idx — 부분 유니크 인덱스
    partialUnique: [
      {
        columns: ["project_id", "kind", "channel", "day_kst"],
        where: (row) => ["reminder", "escalation"].includes(row.kind) && ["claimed", "pending", "sent"].includes(row.status),
        name: "notices_daily_cap_idx",
      },
    ],
    relations: { projects: { table: "projects", via: "project_id" }, steps: { table: "steps", via: "step_id" } },
  },
  push_subscriptions: {
    columns: {
      ...common(),
      endpoint: col({ notNull: true }),
      p256dh: col({ notNull: true }),
      auth: col({ notNull: true }),
      user_agent: col(),
      last_ack_at: col(),
    },
    unique: [["endpoint"]],
  },
};

export function createDb() {
  const data = Object.fromEntries(Object.keys(TABLES).map((name) => [name, []]));
  return { data };
}

// ── 역할 컨텍스트 (RLS) ─────────────────────────────────────────────
// ctx = { role: 'service_role' | 'authenticated' | 'anon', email?: string }
function isAdmin(db, ctx) {
  if (ctx.role === "service_role") return true;
  if (ctx.role !== "authenticated" || !ctx.email) return false;
  return db.data.admins.some((row) => row.email === ctx.email);
}
function guestProjectIds(db, ctx) {
  if (!ctx.email) return new Set();
  return new Set(db.data.project_guests.filter((row) => row.email === ctx.email).map((row) => row.project_id));
}
function myProjectIds(db, ctx) {
  if (isAdmin(db, ctx)) return new Set(db.data.projects.map((row) => row.id));
  return guestProjectIds(db, ctx);
}

// SELECT / UPDATE·DELETE 의 USING — 마이그레이션의 정책 그대로
function rowVisible(db, table, row, ctx, op) {
  if (ctx.role === "service_role") return true;
  if (ctx.role !== "authenticated") return false;
  const admin = isAdmin(db, ctx);
  const mine = myProjectIds(db, ctx);
  switch (table) {
    case "admins":
      return op === "select" && admin;
    case "projects":
      return op === "delete" ? admin : admin || mine.has(row.id);
    case "project_guests":
      return op === "select" ? row.email === ctx.email || admin : admin;
    case "steps":
      if (admin) return true;
      if (op === "select") return mine.has(row.project_id);
      if (op === "update") {
        return mine.has(row.project_id) && row.owner_side === "client" && !["verified", "skipped"].includes(row.status);
      }
      return false;
    case "links":
      return op === "select" ? mine.has(row.project_id) : admin;
    case "comments":
      return op === "delete" ? false : mine.has(row.project_id);
    case "notices":
      return op === "select" && admin;
    case "push_subscriptions":
      return admin;
    default:
      return false;
  }
}

// INSERT / UPDATE 의 WITH CHECK
function withCheck(db, table, row, ctx, op) {
  if (ctx.role === "service_role") return true;
  if (ctx.role !== "authenticated") return false;
  const admin = isAdmin(db, ctx);
  const mine = myProjectIds(db, ctx);
  switch (table) {
    case "admins":
      return false;
    case "projects":
      return op === "insert" ? admin : admin || mine.has(row.id);
    case "project_guests":
      return admin;
    case "steps":
      if (admin) return true;
      return op === "update" && ["todo", "doing", "client_done", "blocked"].includes(row.status);
    case "links":
      return admin;
    case "comments":
      if (op === "insert") return mine.has(row.project_id) && row.author_side === (admin ? "admin" : "client");
      return mine.has(row.project_id);
    case "notices":
      return false;
    case "push_subscriptions":
      return admin;
    default:
      return false;
  }
}

// BEFORE UPDATE 가드 트리거 (allow-list). authenticated 비관리자에게만 적용된다
function guardUpdate(db, table, oldRow, newRow, ctx) {
  if (ctx.role !== "authenticated") return;
  const admin = isAdmin(db, ctx);
  const diffExcept = (allow) =>
    Object.keys({ ...oldRow, ...newRow }).some(
      (key) => !allow.includes(key) && JSON.stringify(oldRow[key] ?? null) !== JSON.stringify(newRow[key] ?? null),
    );
  if (table === "projects" && !admin) {
    if (diffExcept(["github_org", "vercel_team", "supabase_org", "updated_at"])) {
      throw new DbError(400, "P0001", "guests may only update org slug columns");
    }
  }
  if (table === "steps" && !admin) {
    if (["verified", "skipped"].includes(oldRow.status)) {
      throw new DbError(400, "P0001", "guests may not reopen a verified/skipped step");
    }
    if (diffExcept(["status", "blocked_reason", "checked_at", "updated_at"])) {
      throw new DbError(400, "P0001", "guests may only update step status");
    }
    if (newRow.status !== oldRow.status && !["doing", "client_done", "blocked"].includes(newRow.status)) {
      throw new DbError(400, "P0001", "guests may only set doing / client_done / blocked");
    }
  }
  if (table === "comments") {
    const mySide = admin ? "admin" : "client";
    if (diffExcept(["read_at", "deleted_at", "updated_at"])) {
      throw new DbError(400, "P0001", "comment body is immutable");
    }
    if (newRow.deleted_at !== oldRow.deleted_at && oldRow.author_side !== mySide) {
      throw new DbError(400, "P0001", "only the author may delete a comment");
    }
    if (newRow.read_at !== oldRow.read_at && oldRow.author_side === mySide) {
      throw new DbError(400, "P0001", "read_at is set by the receiving side");
    }
  }
}

// ── 제약 ─────────────────────────────────────────────────────────────
function validateRow(db, table, row, { excludeId = null, batch = [] } = {}) {
  const def = TABLES[table];
  for (const [name, spec] of Object.entries(def.columns)) {
    const value = row[name];
    if (spec.notNull && (value === null || value === undefined)) {
      throw new DbError(400, "23502", `null value in column "${name}" of relation "${table}" violates not-null constraint`);
    }
    if (spec.enum && value != null && !ENUM[spec.enum].includes(value)) {
      throw new DbError(400, "23514", `new row for relation "${table}" violates check constraint "${table}_${name}_check"`);
    }
    if (spec.fk && value != null && !db.data[spec.fk].some((parent) => parent.id === value)) {
      throw new DbError(409, "23503", `insert or update on table "${table}" violates foreign key constraint "${table}_${name}_fkey"`);
    }
  }
  for (const unknown of Object.keys(row)) {
    if (!def.columns[unknown]) {
      throw new DbError(400, "PGRST204", `Could not find the '${unknown}' column of '${table}' in the schema cache`);
    }
  }
  for (const check of def.checks ?? []) {
    const message = check(row);
    if (message) throw new DbError(400, "23514", message);
  }
  const others = [...db.data[table].filter((other) => other.id !== excludeId), ...batch];
  for (const columns of def.unique ?? []) {
    if (columns.some((name) => row[name] == null)) continue;
    const clash = others.find((other) => columns.every((name) => other[name] === row[name]));
    if (clash) {
      throw new DbError(409, "23505", `duplicate key value violates unique constraint "${table}_${columns.join("_")}_key"`);
    }
  }
  for (const index of def.partialUnique ?? []) {
    if (!index.where(row)) continue;
    const clash = others.find(
      (other) => index.where(other) && index.columns.every((name) => (other[name] ?? null) === (row[name] ?? null)),
    );
    if (clash) throw new DbError(409, "23505", `duplicate key value violates unique constraint "${index.name}"`);
  }
}

// ── select 파서 ───────────────────────────────────────────────────────
// "id,key,projects!inner(id,code)" → [{col:'id'}, ..., {embed:'projects', table, inner, select:[...]}]
export function parseSelect(text) {
  const items = [];
  let depth = 0;
  let current = "";
  const parts = [];
  for (const ch of text ?? "*") {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current) parts.push(current);
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const open = part.indexOf("(");
    if (open >= 0) {
      let head = part.slice(0, open);
      const inner = part.slice(open + 1, part.lastIndexOf(")"));
      let alias = null;
      if (head.includes(":")) [alias, head] = head.split(":");
      const innerJoin = head.includes("!inner");
      const name = head.replace("!inner", "").replace(/!.*$/, "");
      items.push({ embed: alias ?? name, table: name, inner: innerJoin, select: parseSelect(inner) });
    } else {
      let name = part;
      let alias = null;
      if (name.includes(":")) [alias, name] = name.split(":");
      items.push({ col: name, alias: alias ?? name });
    }
  }
  return items;
}

// ── 필터 ────────────────────────────────────────────────────────────
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function readPath(row, path) {
  // col, col->key, col->>key
  const match = /^([a-z_]+)(->>?)(.+)$/.exec(path);
  if (!match) return row[path];
  const base = row[match[1]];
  if (base == null || typeof base !== "object") return null;
  const value = base[match[3]];
  if (value === undefined) return null;
  return match[2] === "->>" ? (typeof value === "string" ? value : JSON.stringify(value)) : value;
}

function compare(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== "boolean") return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function parseInList(text) {
  // (a,b,"c,d")
  const inner = text.replace(/^\(/, "").replace(/\)$/, "");
  const out = [];
  let current = "";
  let quoted = false;
  for (const ch of inner) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  if (current !== "" || out.length > 0) out.push(current);
  return out;
}

// 결과는 true / false / null(SQL 의 unknown)
function evaluate(op, value, operand) {
  switch (op) {
    case "eq":
      return value == null ? null : String(value) === operand;
    case "neq":
      return value == null ? null : String(value) !== operand;
    case "gt":
      return value == null ? null : compare(value, operand) > 0;
    case "gte":
      return value == null ? null : compare(value, operand) >= 0;
    case "lt":
      return value == null ? null : compare(value, operand) < 0;
    case "lte":
      return value == null ? null : compare(value, operand) <= 0;
    case "like":
    case "ilike": {
      if (value == null) return null;
      const pattern = operand.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, op === "ilike" ? "i" : "").test(String(value));
    }
    case "is":
      if (operand === "null") return value == null;
      if (operand === "true") return value === true;
      if (operand === "false") return value === false;
      return null;
    case "in":
      return value == null ? null : parseInList(operand).includes(String(value));
    default:
      throw new DbError(400, "PGRST100", `unsupported operator ${op}`);
  }
}

function buildFilter(path, spec) {
  let negate = false;
  let rest = spec;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = dot >= 0 ? rest.slice(0, dot) : rest;
  const operand = dot >= 0 ? rest.slice(dot + 1) : "";
  return (row) => {
    const value = readPath(row, path);
    const result = evaluate(op, value, operand);
    if (result === null) return op === "is" ? !negate === false : false; // is 는 null 을 내지 않는다
    return negate ? !result : result;
  };
}

function parseOrder(text) {
  if (!text) return [];
  return text.split(",").map((piece) => {
    const [column, ...flags] = piece.split(".");
    const desc = flags.includes("desc");
    const nullsFirst = flags.includes("nullsfirst") ? true : flags.includes("nullslast") ? false : desc;
    return { column, desc, nullsFirst };
  });
}

function sortRows(rows, orders) {
  if (orders.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, desc, nullsFirst } of orders) {
      const va = readPath(a, column);
      const vb = readPath(b, column);
      if (va == null && vb == null) continue;
      if (va == null) return nullsFirst ? -1 : 1;
      if (vb == null) return nullsFirst ? 1 : -1;
      const c = compare(va, vb);
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

// ── 질의 실행 ─────────────────────────────────────────────────────────
export function parseQuery(searchParams) {
  const select = parseSelect(searchParams.get("select") ?? "*");
  const filters = [];
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED.has(key)) continue;
    filters.push({ path: key, spec: value });
  }
  return {
    select,
    filters,
    order: parseOrder(searchParams.get("order")),
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : null,
    offset: searchParams.has("offset") ? Number(searchParams.get("offset")) : 0,
    onConflict: searchParams.get("on_conflict")?.split(",") ?? null,
  };
}

// 임베드 해석: to-one 만(자식 → 부모). RLS 는 임베드 테이블에도 적용된다
function resolveEmbeds(db, table, row, select, ctx) {
  const def = TABLES[table];
  const out = {};
  for (const item of select) {
    if (item.col) {
      if (item.col === "*") Object.assign(out, row);
      else out[item.alias] = readPath(row, item.col) ?? null;
    }
  }
  for (const item of select) {
    if (!item.embed) continue;
    const relation = def.relations?.[item.table];
    if (!relation) throw new DbError(400, "PGRST200", `Could not find a relationship between '${table}' and '${item.table}'`);
    const parent = db.data[relation.table].find((candidate) => candidate.id === row[relation.via]);
    out[item.embed] =
      parent && rowVisible(db, relation.table, parent, ctx, "select")
        ? resolveEmbeds(db, relation.table, parent, item.select, ctx)
        : null;
  }
  return out;
}

// 필터를 본 테이블/임베드로 나눠 적용한 뒤 행 목록을 돌려준다 (임베드 !inner 포함)
function matchRows(db, table, query, ctx, op) {
  const def = TABLES[table];
  const own = [];
  const embedded = new Map(); // embed alias → filters
  for (const filter of query.filters) {
    const dot = filter.path.indexOf(".");
    const head = dot >= 0 ? filter.path.slice(0, dot) : null;
    const embed = head ? query.select.find((item) => item.embed === head) : null;
    if (embed) {
      const list = embedded.get(head) ?? [];
      list.push(buildFilter(filter.path.slice(dot + 1), filter.spec));
      embedded.set(head, list);
    } else own.push(buildFilter(filter.path, filter.spec));
  }
  return db.data[table].filter((row) => {
    if (!rowVisible(db, table, row, ctx, op)) return false;
    if (!own.every((predicate) => predicate(row))) return false;
    for (const item of query.select) {
      if (!item.embed) continue;
      const relation = def.relations?.[item.table];
      if (!relation) continue;
      const parent = db.data[relation.table].find((candidate) => candidate.id === row[relation.via]);
      const visible = parent && rowVisible(db, relation.table, parent, ctx, "select");
      const predicates = embedded.get(item.embed) ?? [];
      const passes = visible && predicates.every((predicate) => predicate(parent));
      if (item.inner && !passes) return false;
      if (!passes && predicates.length > 0) row = { ...row, [`__hide_${item.embed}`]: true };
    }
    return true;
  });
}

function applyDefaults(table, input) {
  const def = TABLES[table];
  const row = {};
  for (const [name, spec] of Object.entries(def.columns)) {
    if (input[name] !== undefined) row[name] = input[name];
    else if (spec.default !== undefined) row[name] = typeof spec.default === "function" ? spec.default() : spec.default;
    else row[name] = null;
  }
  for (const name of Object.keys(input)) if (!(name in def.columns)) row[name] = input[name];
  return row;
}

function cascadeDelete(db, table, ids) {
  for (const [child, def] of Object.entries(TABLES)) {
    for (const [name, spec] of Object.entries(def.columns)) {
      if (spec.fk !== table) continue;
      const victims = db.data[child].filter((row) => ids.has(row[name])).map((row) => row.id);
      if (victims.length === 0) continue;
      db.data[child] = db.data[child].filter((row) => !victims.includes(row.id));
      cascadeDelete(db, child, new Set(victims));
    }
  }
}

export function select(db, table, query, ctx) {
  if (!TABLES[table]) throw new DbError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  let rows = matchRows(db, table, query, ctx, "select");
  const total = rows.length;
  rows = sortRows(rows, query.order);
  if (query.offset) rows = rows.slice(query.offset);
  if (query.limit != null) rows = rows.slice(0, query.limit);
  return { rows: rows.map((row) => resolveEmbeds(db, table, row, query.select, ctx)), total };
}

export function insert(db, table, body, query, ctx, prefer) {
  if (!TABLES[table]) throw new DbError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  const inputs = Array.isArray(body) ? body : [body];
  const def = TABLES[table];
  const resolution = prefer.resolution; // ignore-duplicates | merge-duplicates | undefined
  const arbiter = query.onConflict ?? ["id"];
  const written = [];
  const batch = [];
  for (const input of inputs) {
    const row = applyDefaults(table, input);
    if (!withCheck(db, table, row, ctx, "insert")) {
      throw new DbError(403, "42501", `new row violates row-level security policy for table "${table}"`);
    }
    if (resolution) {
      const existing = db.data[table].find(
        (other) => arbiter.every((name) => (other[name] ?? null) === (row[name] ?? null)) && arbiter.every((name) => row[name] != null),
      );
      if (existing) {
        if (resolution === "ignore-duplicates") continue;
        const merged = { ...existing, ...input, updated_at: now() };
        validateRow(db, table, merged, { excludeId: existing.id, batch });
        Object.assign(existing, merged);
        written.push(existing);
        continue;
      }
    }
    validateRow(db, table, row, { batch });
    batch.push(row);
  }
  for (const row of batch) {
    db.data[table].push(row);
    written.push(row);
  }
  return written.map((row) => resolveEmbeds(db, table, row, query.select, ctx));
}

export function update(db, table, patch, query, ctx) {
  if (!TABLES[table]) throw new DbError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  const targets = matchRows(db, table, query, ctx, "update");
  const written = [];
  for (const oldRow of targets) {
    const cleaned = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const newRow = { ...oldRow, ...cleaned, updated_at: now() };
    guardUpdate(db, table, oldRow, newRow, ctx);
    if (!withCheck(db, table, newRow, ctx, "update")) {
      throw new DbError(403, "42501", `new row violates row-level security policy for table "${table}"`);
    }
    validateRow(db, table, newRow, { excludeId: oldRow.id });
    written.push({ oldRow, newRow });
  }
  for (const { oldRow, newRow } of written) {
    const index = db.data[table].indexOf(oldRow);
    db.data[table][index] = newRow;
  }
  return written.map(({ newRow }) => resolveEmbeds(db, table, newRow, query.select, ctx));
}

export function remove(db, table, query, ctx) {
  if (!TABLES[table]) throw new DbError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  const targets = matchRows(db, table, query, ctx, "delete");
  const ids = new Set(targets.map((row) => row.id));
  db.data[table] = db.data[table].filter((row) => !ids.has(row.id));
  cascadeDelete(db, table, ids);
  return targets.map((row) => resolveEmbeds(db, table, row, query.select, ctx));
}

// rpc: tick_begin — service_role 전용 (authenticated 는 EXECUTE 회수됨)
export function rpc(db, name, ctx) {
  if (name !== "tick_begin") throw new DbError(404, "PGRST202", `Could not find the function public.${name} in the schema cache`);
  if (ctx.role !== "service_role") throw new DbError(403, "42501", `permission denied for function ${name}`);
  const first = [...db.data.admins].sort((a, b) => compare(a.created_at, b.created_at))[0];
  if (!first) return false;
  const started = first.last_tick_started_at;
  const finished = first.last_tick_finished_at ?? "1970-01-01T00:00:00.000Z";
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  if (started == null || finished >= started || started < tenMinutesAgo) {
    first.last_tick_started_at = now();
    first.updated_at = now();
    return true;
  }
  return false;
}

export function resetDb(db) {
  for (const name of Object.keys(TABLES)) db.data[name] = [];
}
