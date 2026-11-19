import ts from '../node_modules/typescript/lib/typescript.js';
const paths=['finance-ai','finance-assistant','finance-autopilot','receipt-email'].map(x=>'supabase/functions/'+x+'/index.ts');
const options={noEmit:true,allowImportingTsExtensions:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,lib:['lib.es2022.d.ts','lib.dom.d.ts'],strict:false};
const program=ts.createProgram([...paths,'tests/helpers/edge-env.d.ts'],options);
const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>!(d.code===2307&&String(d.messageText).includes('https://')));
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));process.exit(1);}console.log('PASS edge service type checks. Remote imports are validated by Supabase deployment.');
