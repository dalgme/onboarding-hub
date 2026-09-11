-- Phase 2 (D3=A): 되돌림 상태 `returned`.
-- "완료를 눌렀지만 의뢰인이 고칠 것이 하나 남았다"를 상태 하나로 둔다 — 포털 「다음 할 일」·
-- 진행률(0.5 유지)·리마인드·RLS 가 한 값을 읽는다. service_role 만 만들 수 있고, 의뢰인은
-- returned 에서 doing/client_done/blocked 로 나갈 수만 있다(WITH CHECK 는 그대로).
alter table public.steps drop constraint if exists steps_status_check;
alter table public.steps add constraint steps_status_check
  check (status in ('todo','doing','client_done','verified','blocked','skipped','returned'));
-- 가드 트리거·RLS USING 은 verified/skipped 이탈만 막으므로 그대로 둔다:
--   guest: returned → doing | client_done | blocked  (허용)
--   guest: * → returned                              (WITH CHECK 에 없어 불가)
