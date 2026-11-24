import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const target=process.env.PG_TEST_URL;
if(!target)throw Error('Set PG_TEST_URL to an empty disposable local PostgreSQL database named millie_bank_test*.');
const url=new URL(target);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/millie_bank_test[a-z0-9_]*$/.test(url.pathname))throw Error('Ledger tests require a disposable local millie_bank_test database.');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const operations=read('../supabase/migrations/20260927010000_finance_operations.sql');
const base=operations.match(/create function public\.finance_apply_sync_page\([\s\S]*?end \$\$;/i)?.[0];
const classification=read('../supabase/migrations/20260930011300_transaction_intelligence.sql');
const wrapper=classification.match(/CREATE FUNCTION finance_apply_sync_page\([\s\S]*?END \$\$;/)?.[0];
if(!base||!wrapper)throw Error('Cannot locate actual sync implementations');
const file=path.join(os.tmpdir(),`millie-bank-test-${process.pid}.sql`);
try{
 fs.writeFileSync(file,read('./bank-ledger-setup.sql')+'\n'+base+'\nALTER FUNCTION finance_apply_sync_page(uuid,uuid,jsonb,jsonb,jsonb,text) RENAME TO finance_apply_sync_page_before_classification;\n'+wrapper+'\n'+read('./bank-ledger-cases.sql'));
 const run=spawnSync(process.env.PSQL_BIN||'psql',[target,'-X','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8'});
 if(run.error)throw run.error;
 if(run.status!==0)throw Error(run.stderr||run.stdout);
 console.log('PASS actual PostgreSQL sync: replay idempotency, pending promotion preserves UUID and evidence, genuine repeat charges, user category protection, scoped removals, expired leases and atomic rollback/cursor preservation.');
}finally{fs.rmSync(file,{force:true});}
