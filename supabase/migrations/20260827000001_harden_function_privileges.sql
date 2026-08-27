-- SECURITY DEFINER 함수의 REST RPC 노출 차단.
-- 트리거 함수는 어떤 역할도 직접 호출할 필요가 없다.
revoke execute on function public.guard_project_update() from public, anon, authenticated;
revoke execute on function public.guard_step_update() from public, anon, authenticated;
revoke execute on function public.guard_comment_update() from public, anon, authenticated;

-- RLS 헬퍼는 정책 평가를 위해 authenticated만 필요하다. anon 회수.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_project_ids() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_project_ids() to authenticated;
