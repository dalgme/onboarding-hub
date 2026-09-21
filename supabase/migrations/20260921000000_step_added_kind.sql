-- 「새 단계 안내」 문구 종류 추가 — 선택 단계를 프로젝트에 추가하면 의뢰인에게 보낼 카톡 문구를
-- 시스템이 만든다(관리자가 손으로 쓰지 않는다). 거둠 규칙은 next_step 과 같다.
alter table public.notices drop constraint notices_kind_check;
alter table public.notices add constraint notices_kind_check check (kind in (
  'credentials','next_step','step_added','rerequest','reminder','escalation','digest',
  'admin_replied','scope_ready','link_pinned','closed',
  'client_event','verify_event','token_event','push_test','preflight'));
