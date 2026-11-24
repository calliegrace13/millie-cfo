create table finance_ai_connections(owner_id uuid,provider text,model text,credential text,key_suffix text,request_limit integer default 1,revision integer default 1,updated_at timestamptz default now(),primary key(owner_id,provider));
create table finance_ai_settings(owner_id uuid primary key,active_provider text);
create table finance_ai_budgets(owner_id uuid primary key,daily_micros bigint default 1000000,monthly_micros bigint default 5000000);
create table finance_ai_prices(provider text,model text,input_rate numeric,output_rate numeric,cached_rate numeric,write_rate numeric,context_tokens integer,search_rate integer default 10000,valid_until timestamptz);
create table finance_ai_receipt_runs(id uuid primary key default gen_random_uuid(),owner_id uuid,request_id uuid,input_hash text,cache_hash text,provider text,model text,status text default 'running',result jsonb,started_at timestamptz default now(),finished_at timestamptz);
create table finance_ai_charges(run_id uuid primary key,owner_id uuid,reserved_micros bigint,cost_micros bigint,state text default 'reserved',rates jsonb,stage text,started_at timestamptz default now(),settled_at timestamptz);
alter table finance_autopilot_settings add column workflow_scope text default 'core',add column limit_required_micros bigint default 0;
