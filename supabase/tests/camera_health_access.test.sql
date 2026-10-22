-- Shared public-feed health may be read, never written, by a tenant browser.
begin;
insert into ophanim_camera_health(feed_id,checked_at,status,detail,consecutive_failures)
 values('synthetic-health-access-test',now(),'unverified','TEST ONLY',2);
set local role authenticated;
do $$ begin
 if not exists(select 1 from ophanim_camera_health where feed_id='synthetic-health-access-test' and consecutive_failures=2) then
  raise exception 'Public-feed health read failed';
 end if;
 begin update ophanim_camera_health set consecutive_failures=0 where feed_id='synthetic-health-access-test';raise exception 'Browser rewrote health';exception when insufficient_privilege then null;end;
 begin insert into ophanim_camera_health(feed_id,checked_at,status,detail) values('browser-write',now(),'online','fake');raise exception 'Browser created live status';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin update ophanim_camera_health set consecutive_failures=0;raise exception 'Anonymous health mutation';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
