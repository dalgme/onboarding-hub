-- 관리자 휴대폰 알림(웹 푸시) 구독 목록.
-- 알림 큐가 아니다(§12) — "어느 기기로 보낼지"만 담고, 알림 자체는 의뢰인의
-- 행동(완료 요청·막힘·질문)이 일어나는 서버 액션에서 그 자리에서 보낸다.
-- 관리자만 읽고 쓴다. 의뢰인 세션에는 보이지 않는다.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute procedure extensions.moddatetime (updated_at);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (public.is_admin());
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated with check (public.is_admin());
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (public.is_admin());
