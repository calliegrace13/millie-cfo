import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const target=process.env.PG_TEST_URL;
if(!target)throw Error('Set PG_TEST_URL to a disposable local millie_bank_test* database.');
const url=new URL(target);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/millie_bank_test[a-z0-9_]*$/.test(url.pathname))throw Error('A disposable local database is required.');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const migrations=['20261103010000_connected_financial_context.sql','20261124010000_automatic_receipt_context_links.sql'].map(n=>read('../supabase/migrations/'+n).replace(/^begin;\s*$/gim,'').replace(/^commit;\s*$/gim,''));
const file=path.join(os.tmpdir(),`millie-context-auto-link-${process.pid}.sql`);
try{
 fs.writeFileSync(file,read('./context-auto-link-setup.sql')+'\n'+migrations.join('\n')+'\n'+read('./context-auto-link-cases.sql'));
 const r=spawnSync(process.env.PSQL_BIN||'psql',[target,'-X','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8'});
 if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);
 console.log('PASS actual SQL auto-links: AI/manual permissions, sole candidates, currency/date/pending filters, competing receipts, duplicate-looking purchases, user isolation, provenance, replay, Undo suppression, new receipt and bank triggers, unchanged ledger and private RPCs.');
}finally{fs.rmSync(file,{force:true});}
