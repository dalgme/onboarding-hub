-- 관리자(나) 이메일 1건 등록. 배포 시 본인 이메일로 바꿔서 1회 실행.
insert into public.admins (email)
values ('jinkidi@gmail.com')
on conflict (email) do nothing;
