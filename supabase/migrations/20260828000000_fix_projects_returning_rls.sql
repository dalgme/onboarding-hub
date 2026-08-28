-- INSERT ... RETURNING이 projects_select 정책에 걸리는 문제 수정.
-- my_project_ids()는 projects를 자기참조해서, 같은 문장에서 막 삽입된
-- 행이 스냅샷에 없어 RETURNING이 42501로 거부된다.
-- 관리자 판정은 행과 무관한 is_admin() 직접 호출로, 의뢰인 판정은
-- project_guests만 보는 전용 헬퍼로 분리한다.

create or replace function public.my_guest_project_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select project_id from project_guests where email = auth.email()
$$;

revoke execute on function public.my_guest_project_ids() from public, anon;
grant execute on function public.my_guest_project_ids() to authenticated;

drop policy projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_admin() or id in (select public.my_guest_project_ids()));

drop policy projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_admin() or id in (select public.my_guest_project_ids()))
  with check (public.is_admin() or id in (select public.my_guest_project_ids()));
