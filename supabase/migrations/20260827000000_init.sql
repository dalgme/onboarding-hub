-- 온보딩 허브 라이트 — 초기 스키마
-- 테이블 6개 + RLS + 헬퍼 함수. 새 테이블은 반드시 같은 마이그레이션에서 RLS까지.

create extension if not exists moddatetime schema extensions;

-- ──────────────────────────────────────────────────────────────────
-- 테이블
-- ──────────────────────────────────────────────────────────────────

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  client_name text not null,
  client_email text not null,
  support_tier text not null default 'assisted'
    check (support_tier in ('self', 'assisted')),
  status text not null default 'onboarding'
    check (status in ('onboarding', 'building', 'delivered', 'closed')),
  github_org text,
  vercel_team text,
  supabase_org text,
  domain text,
  scope_md text,
  scope_agreed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  order_index int not null default 0,
  key text not null,
  title text not null,
  description_md text not null default '',
  owner_side text not null check (owner_side in ('client', 'agency')),
  verify_type text not null default 'manual'
    check (verify_type in ('manual', 'github', 'vercel', 'supabase')),
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'client_done', 'verified', 'blocked', 'skipped')),
  checked_at timestamptz,
  verified_at timestamptz,
  verify_result jsonb,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key),
  -- blocked면 blocked_reason 필수
  check (status <> 'blocked' or blocked_reason is not null)
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  order_index int not null default 0,
  label text not null,
  url text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step_id uuid references public.steps (id) on delete cascade,
  author_side text not null check (author_side in ('admin', 'client')),
  kind text not null check (kind in ('question', 'request')),
  body text not null,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index steps_project_idx on public.steps (project_id, order_index);
create index links_project_idx on public.links (project_id, order_index);
create index comments_project_idx on public.comments (project_id, created_at);
create index project_guests_email_idx on public.project_guests (email);

-- updated_at 자동 갱신
create trigger set_updated_at before update on public.admins
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.projects
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.project_guests
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.steps
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.links
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.comments
  for each row execute procedure extensions.moddatetime (updated_at);

-- ──────────────────────────────────────────────────────────────────
-- RLS 헬퍼
-- ──────────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from admins where email = auth.email())
$$;

create or replace function public.my_project_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select id from projects where public.is_admin()
  union
  select project_id from project_guests where email = auth.email()
$$;

-- ──────────────────────────────────────────────────────────────────
-- 컬럼 가드 트리거 — RLS는 행 단위라서, 의뢰인이 고칠 수 있는
-- 컬럼 범위는 트리거로 강제한다 (스펙 §7 의뢰인 쓰기 허용 세 곳).
-- ──────────────────────────────────────────────────────────────────

-- projects: 의뢰인은 조직 slug 3개 컬럼만 변경 가능
create or replace function public.guard_project_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.code            is distinct from old.code
    or new.name          is distinct from old.name
    or new.client_name   is distinct from old.client_name
    or new.client_email  is distinct from old.client_email
    or new.support_tier  is distinct from old.support_tier
    or new.status        is distinct from old.status
    or new.domain        is distinct from old.domain
    or new.scope_md      is distinct from old.scope_md
    or new.scope_agreed_at is distinct from old.scope_agreed_at
    or new.closed_at     is distinct from old.closed_at
  then
    raise exception 'guests may only update org slug columns';
  end if;
  return new;
end;
$$;

create trigger guard_project_update before update on public.projects
  for each row execute procedure public.guard_project_update();

-- steps: 의뢰인은 status(doing/client_done/blocked)·blocked_reason·checked_at만.
-- verified/skipped는 나만 (WITH CHECK + 트리거 이중 강제).
create or replace function public.guard_step_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.project_id      is distinct from old.project_id
    or new.order_index   is distinct from old.order_index
    or new.key           is distinct from old.key
    or new.title         is distinct from old.title
    or new.description_md is distinct from old.description_md
    or new.owner_side    is distinct from old.owner_side
    or new.verify_type   is distinct from old.verify_type
    or new.verified_at   is distinct from old.verified_at
    or new.verify_result is distinct from old.verify_result
  then
    raise exception 'guests may only update step status';
  end if;
  if new.status is distinct from old.status
    and new.status not in ('doing', 'client_done', 'blocked')
  then
    raise exception 'guests may only set doing / client_done / blocked';
  end if;
  return new;
end;
$$;

create trigger guard_step_update before update on public.steps
  for each row execute procedure public.guard_step_update();

-- comments: 수정은 read_at(상대 글)·deleted_at(내 글)만. 본문 수정 없음.
create or replace function public.guard_comment_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  my_side text := case when public.is_admin() then 'admin' else 'client' end;
begin
  if new.project_id      is distinct from old.project_id
    or new.step_id       is distinct from old.step_id
    or new.author_side   is distinct from old.author_side
    or new.kind          is distinct from old.kind
    or new.body          is distinct from old.body
  then
    raise exception 'comment body is immutable';
  end if;
  if new.deleted_at is distinct from old.deleted_at
    and old.author_side <> my_side
  then
    raise exception 'only the author may delete a comment';
  end if;
  if new.read_at is distinct from old.read_at
    and old.author_side = my_side
  then
    raise exception 'read_at is set by the receiving side';
  end if;
  return new;
end;
$$;

create trigger guard_comment_update before update on public.comments
  for each row execute procedure public.guard_comment_update();

-- ──────────────────────────────────────────────────────────────────
-- RLS 정책
-- ──────────────────────────────────────────────────────────────────

alter table public.admins enable row level security;
alter table public.projects enable row level security;
alter table public.project_guests enable row level security;
alter table public.steps enable row level security;
alter table public.links enable row level security;
alter table public.comments enable row level security;

-- admins: 관리자만 조회. 등록·삭제는 대시보드/SQL로만 한다.
create policy admins_select on public.admins
  for select to authenticated using (public.is_admin());

-- projects
create policy projects_select on public.projects
  for select to authenticated
  using (id in (select public.my_project_ids()));
create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_admin());
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_admin());
-- update: 관리자 전체 / 의뢰인은 자기 프로젝트 행만 (컬럼은 트리거가 제한)
create policy projects_update on public.projects
  for update to authenticated
  using (id in (select public.my_project_ids()))
  with check (id in (select public.my_project_ids()));

-- project_guests: 자기 행은 본인도 조회 가능 (로그인 후 분기용)
create policy project_guests_select on public.project_guests
  for select to authenticated
  using (email = auth.email() or public.is_admin());
create policy project_guests_admin_write on public.project_guests
  for insert to authenticated with check (public.is_admin());
create policy project_guests_admin_update on public.project_guests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy project_guests_admin_delete on public.project_guests
  for delete to authenticated using (public.is_admin());

-- steps
create policy steps_select on public.steps
  for select to authenticated
  using (project_id in (select public.my_project_ids()));
create policy steps_admin_insert on public.steps
  for insert to authenticated with check (public.is_admin());
create policy steps_admin_delete on public.steps
  for delete to authenticated using (public.is_admin());
-- 관리자: 전체 수정. 의뢰인: owner_side='client'인 자기 프로젝트 단계만,
-- 결과 status는 doing/client_done/blocked만 (verified/skipped 불가).
create policy steps_admin_update on public.steps
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy steps_guest_update on public.steps
  for update to authenticated
  using (
    not public.is_admin()
    and project_id in (select public.my_project_ids())
    and owner_side = 'client'
  )
  with check (
    status in ('todo', 'doing', 'client_done', 'blocked')
  );

-- links: 의뢰인 읽기 전용
create policy links_select on public.links
  for select to authenticated
  using (project_id in (select public.my_project_ids()));
create policy links_admin_insert on public.links
  for insert to authenticated with check (public.is_admin());
create policy links_admin_update on public.links
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy links_admin_delete on public.links
  for delete to authenticated using (public.is_admin());

-- comments: author_side는 서버(정책)가 결정 — 클라이언트 값을 믿지 않는다
create policy comments_select on public.comments
  for select to authenticated
  using (project_id in (select public.my_project_ids()));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    project_id in (select public.my_project_ids())
    and author_side = case when public.is_admin() then 'admin' else 'client' end
  );
create policy comments_update on public.comments
  for update to authenticated
  using (project_id in (select public.my_project_ids()))
  with check (project_id in (select public.my_project_ids()));
