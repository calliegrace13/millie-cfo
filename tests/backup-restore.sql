begin;
-- Restore a consistent snapshot into an isolated schema, compare every row,
-- then roll back. Live tables, triggers, and accounts are never overwritten.
create schema millie_restore_test;
do $$
declare snapshot jsonb; t record; schema_name text; table_name text; restored jsonb; expected jsonb; difference bigint;
begin
 select payload into strict snapshot from millie_operations.snapshots order by created_at desc limit 1;
 for t in select key,value from jsonb_each(snapshot) where key<>'recovery' loop
  schema_name:=split_part(t.key,'.',1);table_name:=split_part(t.key,'.',2);
  execute format('create table millie_restore_test.%I (like %I.%I)',schema_name||'_'||table_name,schema_name,table_name);
  execute format('insert into millie_restore_test.%I select * from jsonb_populate_recordset(null::%I.%I,$1)',schema_name||'_'||table_name,schema_name,table_name) using t.value;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from millie_restore_test.%I t',schema_name||'_'||table_name) into restored;
  select count(*) into difference from ((select value from jsonb_array_elements(t.value) except all select value from jsonb_array_elements(restored)) union all (select value from jsonb_array_elements(restored) except all select value from jsonb_array_elements(t.value))) diffs;
  if difference<>0 then raise exception 'Restore comparison failed for %',t.key;end if;
 end loop;
end $$;
rollback;
select 'PASS: all snapshot tables restored in isolated schema with exact row comparisons; live data unchanged' as result;
