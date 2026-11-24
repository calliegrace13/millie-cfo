import {ASSISTANT_TASKS} from '../../supabase/functions/_shared/assistant-tasks';

export function workflowProgress(modules:string[],policies:any[],work:any[],items:any[]){
 return ASSISTANT_TASKS.filter(t=>t.module==='transactions'||modules.includes(t.module)).map(task=>{
  const saved=work.filter(w=>w.payload?.module===task.module&&w.payload?.task===task.id);
  const questions=items.filter(i=>i.module===task.module&&i.task===task.id&&['needs_input','ready'].includes(i.status)&&!i.answer);
  const failed=saved.some(w=>w.status==='failed'),running=saved.some(w=>w.status==='running'),checked=saved.some(w=>w.status==='done');
  const enabled=policies.some(p=>p.module===task.module&&p.mode==='ai'&&p.tasks.includes(task.id));
  const state=failed?'Review a failed task':running?'Working':questions.length?'Needs you':checked?'Checked':enabled?'Queued':'Ready to enable';
  return {...task,state,checked,failed,questions:questions.length};
 });
}
