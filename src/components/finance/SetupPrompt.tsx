import {Link,useLocation} from 'react-router-dom';
import {useSetup} from '@/hooks/useSetup';
import {useModules} from '@/hooks/useModules';
import {MODULES,moduleForPath} from '@/lib/modules';
import {SETUP_GUIDES,nextSetup,guideStatus,setupReturnId,setupName} from '@/lib/module-setup';
import {Button} from '@/components/ui/button';
import {useSetupAssessment} from '@/hooks/useSetupAssessment';
import {effectiveSetupProgress} from '@/lib/setup-assessment';
export function SetupPrompt(){
 const {pathname,search}=useLocation(),s=useSetup(),m=useModules(),smart=useSetupAssessment(false);if(pathname==='/setup')return null;
 const p=s.progress&&smart.available?effectiveSetupProgress(s.progress,smart.assessment.steps):s.progress;
 const id=moduleForPath(pathname),guide=SETUP_GUIDES.find(g=>g.id===id),pending=p?nextSetup(m.enabled,p):undefined;
 const context=setupReturnId(search,m.enabled),returnId=context||guide?.id||pending?.id;
 if(s.error)return <div className="rounded-xl border p-3 mb-5 text-sm flex flex-wrap gap-2 justify-between"><span>Setup progress is temporarily unavailable. Your financial tools are still available.</span><button className="underline" onClick={s.reload}>Retry setup</button></div>;
 if(!context&&s.progress?.status!=='active')return null;
 return <div className="rounded-xl border bg-card/60 px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><p className="font-medium">{s.progress?.status==='active'?'Your setup is in progress':guide?.title+' setup'}</p><p className="text-xs text-muted-foreground mt-1">{context?'Working on: '+setupName(context):s.progress?.status==='active'&&pending?'Next: '+pending.title:guide&&s.progress&&guideStatus(guide,s.progress)==='reviewed'?'Guide reviewed · revisit when your situation changes':'A short guide to the choices that matter. Your records stay in this workspace.'}</p></div><div className="flex flex-wrap gap-2">{guide&&<Button asChild size="sm" variant="ghost"><Link to={'/setup?module='+guide.id}>Setup guide</Link></Button>}{s.progress?.status==='active'&&<Button asChild size="sm" variant="outline"><Link to={returnId?'/setup?module='+returnId:'/setup'}>Return to setup</Link></Button>}</div></div>;
}
