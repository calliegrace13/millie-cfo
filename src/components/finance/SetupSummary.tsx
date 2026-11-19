import {Link} from 'react-router-dom';
import {Compass} from 'lucide-react';
import {useSetup} from '@/hooks/useSetup';
import {useModules} from '@/hooks/useModules';
import {setupQueue,guideStatus,nextSetup} from '@/lib/module-setup';
import {Button} from '@/components/ui/button';
import {useSetupAssessment} from '@/hooks/useSetupAssessment';
import {effectiveSetupProgress} from '@/lib/setup-assessment';
export function SetupSummary(){
 const s=useSetup(),m=useModules(),smart=useSetupAssessment(),queue=setupQueue(m.enabled),p=s.progress&&smart.available?effectiveSetupProgress(s.progress,smart.assessment.steps):s.progress,reviewed=p?queue.filter(g=>guideStatus(g,p)==='reviewed').length:0,next=p?nextSetup(m.enabled,p):null;
 return <section aria-label="Guided module setup" className="rounded-2xl border bg-card p-5 flex flex-wrap justify-between items-center gap-4"><div className="flex gap-3"><Compass className="h-5 w-5 shrink-0 text-primary mt-0.5"/><div><h2 className="font-semibold">Set up your tools, one at a time</h2><p className="text-sm text-muted-foreground mt-1">{smart.loading?'Checking your existing configuration…':p?.choice_confirmed?`${reviewed} of ${queue.length} selected workspaces ready.${next?' Next: '+next.title+'.':''}`:'Each module has its own setup procedure. Start with accounts, then follow a path based on the tools you choose.'}</p><p className="text-xs text-muted-foreground mt-1">Save your place, defer what does not apply, and revisit guides after life changes.</p></div></div><Button asChild variant="outline"><Link to="/setup">{smart.loading?'Checking your existing configuration…':p?.choice_confirmed?'Open setup guide':'Start guided setup'}</Link></Button></section>;
}
