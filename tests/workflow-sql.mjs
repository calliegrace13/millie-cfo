import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const target=process.env.PG_TEST_URL;if(!target)throw Error('Set PG_TEST_URL to a disposable local millie_bank_test* database.');
const u=new URL(target);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/millie_bank_test[a-z0-9_]*$/.test(u.pathname))throw Error('Disposable local database required.');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const policies=read('../supabase/migrations/20261025030000_module_ai_modes.sql');
const keys=policies.match(/create function finance_ai_task_keys\([\s\S]*?\$\$;/)[0],setter=policies.match(/create function finance_set_ai_policy\([\s\S]*?end;\$\$;/)[0];
const migration=(read('../supabase/migrations/20261124030000_unified_ai_workflow.sql')+'\n'+read('../supabase/migrations/20261124050000_unified_workflow_cadence.sql')).replace(/^begin;\s*$/gim,'').replace(/^commit;\s*$/gim,'');
const file=path.join(os.tmpdir(),`millie-workflow-${process.pid}.sql`);
try{fs.writeFileSync(file,read('./workflow-sql-setup.sql')+'\n'+keys+'\n'+setter+'\n'+migration+'\n'+read('./workflow-sql-cases.sql'));const r=spawnSync(process.env.PSQL_BIN||'psql',[target,'-X','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8'});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);console.log('PASS actual SQL workflow opt-in, visible module scope, unchanged save/privacy permissions, optimistic concurrency, zero budget/unpriced gates, failed-call preservation and legacy-safe scheduling. Synthetic dispatcher only.');}finally{fs.rmSync(file,{force:true});}
