import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText,uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const modules=uri(compile(fs.readFileSync('src/lib/modules.ts','utf8'))),{ALL_MODULES,moduleForPath}=await import(modules);
const {WORKSPACE_TOOLS,workspaceTools}=await import(uri(compile(fs.readFileSync('src/lib/workspace-navigation.ts','utf8').replace("'./modules'",JSON.stringify(modules)))));
for(let mask=0;mask<2**ALL_MODULES.length;mask++){const enabled=ALL_MODULES.filter((_,i)=>mask&(1<<i)),shown=workspaceTools(enabled);for(const t of shown){const module=moduleForPath(t.href.split('#')[0]);assert(!module||enabled.includes(module));}assert(shown.some(t=>t.href==='/accounts'));assert(shown.some(t=>t.href==='/transactions'));}
assert.equal(new Set(WORKSPACE_TOOLS.map(t=>t.href)).size,WORKSPACE_TOOLS.length);
assert(workspaceTools(ALL_MODULES,'flight').some(t=>t.href==='/trips'));assert(workspaceTools(ALL_MODULES,'receipt').some(t=>t.href==='/receipts'));assert.equal(workspaceTools(ALL_MODULES,'no such tool').length,0);assert(workspaceTools(ALL_MODULES,'','Financial picture').every(t=>t.group==='Financial picture'));
const app=fs.readFileSync('src/App.tsx','utf8');for(const t of WORKSPACE_TOOLS)assert(app.includes('path="'+t.href.split('#')[0]+'"'),'Tool has a working route '+t.href);
for(const p of ['src/hooks/useExperience.tsx','src/pages/WorkspaceHome.tsx','src/pages/WorkspaceTools.tsx'])assert(!/finance_set_ai_policy|finance_save|finance_assign|assistantRequest\(/.test(fs.readFileSync(p,'utf8')),'Navigation never changes finances or spends AI');
console.log('PASS all 16384 module combinations, search, report filters, unique destinations, live route coverage and no financial/AI side effects in workspace navigation.');
