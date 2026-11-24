import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const target=process.env.PG_TEST_URL;if(!target)throw Error('Set PG_TEST_URL to a disposable local millie_bank_test* database.');
const u=new URL(target);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/millie_bank_test[a-z0-9_]*$/.test(u.pathname))throw Error('Disposable local database required.');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../supabase/migrations/20261103010000_durable_agent.sql');
const spending=source.match(/create function finance_ai_spending\([\s\S]*?\$\$;/)[0];
const migration=read('../supabase/migrations/20261124040000_dollar_first_ai_limits.sql').replace(/^begin;\s*$/gim,'').replace(/^commit;\s*$/gim,'');
const file=path.join(os.tmpdir(),`millie-dollar-test-${process.pid}.sql`);
try{fs.writeFileSync(file,read('./workflow-sql-setup.sql')+'\n'+read('./dollar-limits-setup.sql')+'\n'+spending+'\n'+migration+'\n'+read('./dollar-limits-cases.sql'));const r=spawnSync(process.env.PSQL_BIN||'psql',[target,'-X','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8'});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);console.log('PASS actual dollar reservations: more than count cap permitted, optional cap retained, daily/monthly ceilings, serialized calls, unchanged budgets, correct resumption and cached recovery. No real paid calls.');}finally{fs.rmSync(file,{force:true});}
