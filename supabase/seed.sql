-- 관리자(나) 이메일 1건 등록. 마이그레이션을 먼저 적용한 뒤 1회 실행.
-- (2026-08-27 onboarding-hub 프로젝트에 적용 완료)
insert into public.admins (email)
values ('jinkidi@hanmail.net')
on conflict (email) do nothing;
