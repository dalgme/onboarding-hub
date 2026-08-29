-- 의뢰인 마지막 접속 시각. 감사 로그 테이블 대신(스펙 §12) 컬럼 하나로
-- "언제 마지막으로 들어왔나"만 기록한다. 갱신은 서버(service_role)가 한다.
alter table public.project_guests
  add column if not exists last_seen_at timestamptz;
