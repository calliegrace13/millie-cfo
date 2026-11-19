begin;
create or replace function finance_email_claim_state(_hash text,_owner uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s finance_email_oauth_states;
begin
 update finance_email_oauth_states set claimed=true where state_hash=_hash and owner_id=_owner and not claimed and expires_at>now() returning * into s;
 if not found then raise exception 'Email authorization expired, belongs to another login or was already used';end if;
 return to_jsonb(s);
end;$$;
revoke all on function finance_email_claim_state(text,uuid) from public,anon,authenticated;
grant execute on function finance_email_claim_state(text,uuid) to service_role;
drop function if exists finance_email_claim_state(text);
commit;
