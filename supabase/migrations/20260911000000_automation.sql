-- 전사적 자동화 Phase 1a (docs/automation-redesign.md §9)
--  1) notices — 푸시 장부 + 「보낼 카톡」(관리자가 카톡으로 보낼 완성 문구). 큐가 아니다
--  2) 컬럼 — 크론 heartbeat·토큰 점검 시각(admins), 푸시 ack(push_subscriptions),
--            접속 안내 「보냈음」 시각·리마인드 보류(projects)
--  3) 가드 트리거 allow-list 전환 + verified/skipped 이탈 금지 (DB·RLS 이중 강제)

-- ──────────────────────────────────────────────────────────────────
-- 1) notices
--    channel='push'  : 내 폰으로 실제 보낸 기록            (claimed → sent | failed)
--    channel='outbox': 의뢰인에게 보낼 완성 카톡 문구. 관리자가 보내고 「보냈음」을 누른다
--                      (pending → sent | skipped | superseded)
--    dedupe_key 가 멱등 키다 — 「이미 만들었는가」를 답한다. 실패·거둔 행은 재시도하지
--    않는다. 다음 tick 이 조건을 다시 계산해 새 키(에폭 포함)로 만든다.
--    관리자만 읽는다. 쓰기는 service_role 만(정책 없음 = 막힘).
--    의뢰인에게 직접 보내는 채널 값(email·sms)은 없다 — 허브는 의뢰인에게 보내지 않는다.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,   -- 시스템 전체 알림은 null
  step_id uuid references public.steps (id) on delete cascade,
  kind text not null check (kind in (
    'credentials','next_step','rerequest','reminder','escalation','digest',
    'admin_replied','scope_ready','link_pinned','closed',
    'client_event','verify_event','token_event','push_test','preflight')),
  channel text not null check (channel in ('push','outbox')),
  dedupe_key text not null unique,            -- 반드시 에폭(전이 시각·회차)을 포함한다
  status text not null
    check (status in ('claimed','pending','sent','failed','skipped','superseded')),
  title text,                                 -- outbox: 카드 사유 라벨 (「GitHub 초대 재요청」)
  body text,                                  -- outbox: 카톡 문구 전문. 비밀번호·토큰·로그인 링크 금지
  skip_reason text
    check (skip_reason in ('admin','condition_cleared','cap')),  -- outbox skipped 사유
  claimed_at timestamptz,                     -- push
  sent_at timestamptz,                        -- push: 푸시 서비스 201 시각 / outbox: 관리자 「보냈음」 클릭 시각
  acked_at timestamptz,                       -- push: 서비스워커 ack. 「배달됨」의 유일한 근거
  day_kst date not null,                      -- 앱이 KST 로 계산해 넣는다 (일일 상한 인덱스용)
  detail text,                                -- redact 경유. 상태 코드·오류 클래스·단계 키만
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notices_project_idx on public.notices (project_id, created_at desc);
create index notices_claimed_idx on public.notices (claimed_at) where status = 'claimed';  -- stale claim 청소
create index notices_pending_idx on public.notices (created_at) where status = 'pending';  -- 「보낼 카톡」 카드·적체
create index notices_kind_idx on public.notices (kind, created_at desc);                  -- 토큰 전환·최근 자동 조치
-- 「같은 사유로 하루 2건 금지」— 리마인드 계열만. 대체는 이전 행을 superseded 로 바꾼 뒤 삽입한다
create unique index notices_daily_cap_idx on public.notices (project_id, kind, day_kst)
  where kind in ('reminder','escalation') and status in ('claimed','pending','sent');
create trigger set_updated_at before update on public.notices
  for each row execute procedure extensions.moddatetime (updated_at);
alter table public.notices enable row level security;
create policy notices_select on public.notices
  for select to authenticated using (public.is_admin());
-- insert/update/delete 정책 없음 → authenticated 는 쓰지 못한다. service_role 만 쓴다(「보냈음」도 서버 액션).

-- ──────────────────────────────────────────────────────────────────
-- 2) 컬럼
alter table public.projects add column access_sent_at timestamptz;        -- 접속 안내 「보냈음」 시각(리마인드·미접속 기준점)
alter table public.projects add column remind_paused_until timestamptz;   -- 관리자 「보류」 칩
alter table public.push_subscriptions add column last_ack_at timestamptz; -- 마지막 ack(배달 확인)
alter table public.admins add column last_tick_started_at timestamptz;    -- tick 락 겸 heartbeat 시작
alter table public.admins add column last_tick_finished_at timestamptz;   -- 배너는 이 값으로 판정
alter table public.admins add column last_token_check_at timestamptz;     -- 토큰 점검 게이트(시각 슬롯 아님)

-- ──────────────────────────────────────────────────────────────────
-- 3) 가드 트리거 allow-list 전환 + verified/skipped 이탈 금지
--    이전 가드는 deny-list 라 새 컬럼(access_sent_at 등)이 기본으로 「열림」이었고,
--    old.status 를 보지 않아 의뢰인 세션이 verified → client_done 을 통과시켰다.
create or replace function public.guard_project_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
    return new;
  end if;
  if to_jsonb(new) - 'github_org' - 'vercel_team' - 'supabase_org' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'github_org' - 'vercel_team' - 'supabase_org' - 'updated_at'
  then
    raise exception 'guests may only update org slug columns';
  end if;
  return new;
end;
$$;

create or replace function public.guard_step_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
    return new;
  end if;
  if old.status in ('verified', 'skipped') then
    raise exception 'guests may not reopen a verified/skipped step';
  end if;
  if to_jsonb(new) - 'status' - 'blocked_reason' - 'checked_at' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'status' - 'blocked_reason' - 'checked_at' - 'updated_at'
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

-- RLS 이중 강제: USING 에 이탈 금지 추가 (WITH CHECK 는 그대로)
drop policy steps_guest_update on public.steps;
create policy steps_guest_update on public.steps
  for update to authenticated
  using (
    not public.is_admin()
    and project_id in (select public.my_project_ids())
    and owner_side = 'client'
    and status not in ('verified', 'skipped')
  )
  with check (
    status in ('todo', 'doing', 'client_done', 'blocked')
  );

-- ──────────────────────────────────────────────────────────────────
-- 4) tick 락 — 한 번에 하나만 돈다. 시작 시각을 원자적으로 잡는다.
--    진행 중(started > finished)이고 10분이 안 지났으면 false. service_role 만 부른다.
create or replace function public.tick_begin()
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  claimed uuid;
begin
  update public.admins
     set last_tick_started_at = now()
   where id = (select id from public.admins order by created_at limit 1)
     and (
       last_tick_started_at is null
       or coalesce(last_tick_finished_at, 'epoch'::timestamptz) >= last_tick_started_at
       or last_tick_started_at < now() - interval '10 minutes'
     )
  returning id into claimed;
  return claimed is not null;
end;
$$;
revoke execute on function public.tick_begin() from public, anon, authenticated;
