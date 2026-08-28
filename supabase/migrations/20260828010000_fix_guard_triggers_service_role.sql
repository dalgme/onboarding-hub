-- 컬럼 가드 트리거가 JWT 없는 연결(service_role·SQL 콘솔)까지 의뢰인으로
-- 취급하던 문제 수정. 가드는 authenticated 역할의 비관리자에게만 적용한다.
-- (검증 API는 service_role로 verify_result를 기록한다 — 막히면 안 된다)

create or replace function public.guard_project_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
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

create or replace function public.guard_step_update()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
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

create or replace function public.guard_comment_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  my_side text := case when public.is_admin() then 'admin' else 'client' end;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
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
