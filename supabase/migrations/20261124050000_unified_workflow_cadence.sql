begin;
-- Continue independent opted-in tasks on the next scheduler tick. Failed work
-- remains failed; three consecutive failures still stop dispatch. Core users
-- retain the original cadence and the dollar wait path is unchanged.
create or replace function finance_autopilot_end(_owner uuid,_lease uuid,_status text,_summary text,_attention jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if _status not in('working','idle','needs_input','limit','error','paused') or jsonb_typeof(_attention)<>'array' or jsonb_array_length(_attention)>30 then raise exception 'Invalid automatic work status';end if;
 if _status='limit' then perform finance_autopilot_wait(_owner,_lease,0,_attention);return;end if;
 update finance_autopilot_settings set lease=null,lease_until=null,status=case when enabled then _status else 'paused' end,summary=left(_summary,1800),attention=_attention,last_finished_at=clock_timestamp(),updated_at=clock_timestamp(),failure_count=case when _status='error' then failure_count+1 else 0 end,
 next_run_at=clock_timestamp()+case when workflow_scope='all_enabled' and _status='working' then interval '0 seconds' when workflow_scope='all_enabled' and _status='error' then interval '1 minute' when _status='working' then interval '1 minute' when _status='error' then interval '15 minutes' else interval '15 minutes' end where owner_id=_owner and lease=_lease;
end;$$;
update finance_autopilot_settings set next_run_at=least(next_run_at,clock_timestamp()+interval '1 minute') where enabled and background_enabled and workflow_scope='all_enabled' and status='error' and lease is null and failure_count<3;
commit;
