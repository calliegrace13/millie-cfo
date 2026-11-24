-- Disposable LOCAL database only; every object and fixture rolls back.
BEGIN;
CREATE SCHEMA millie_operations;
CREATE TYPE cash_flow_category AS ENUM ('operating','other');
CREATE TABLE accounts(id uuid primary key,user_id uuid,plaid_account_id text,is_deleted boolean,name text);
CREATE TABLE plaid_items(id uuid primary key,user_id uuid,cursor text);
CREATE TABLE millie_operations.sync_state(item_id uuid primary key,lease uuid,lease_until timestamptz);
CREATE TABLE transactions(id uuid primary key default gen_random_uuid(),user_id uuid,account_id uuid,account_name text,plaid_transaction_id text unique,name text,merchant_name text,amount numeric,date date,category text,subcategory text,pending boolean,cash_flow_type cash_flow_category,is_one_time_expense boolean,income_type text,provider_metadata jsonb,classification_source text,classification_locked boolean default false,notes text);
CREATE TABLE supporting_links(transaction_id uuid references transactions(id),note text);
