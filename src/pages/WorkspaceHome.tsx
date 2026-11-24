import {useEffect,useRef} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowRight,ArrowUpRight,CheckCheck} from 'lucide-react';
import {CfoBriefing} from '@/components/finance/CfoBriefing';
import {AutopilotControl} from '@/components/finance/AutopilotControl';
import {useSetup} from '@/hooks/useSetup';
import {AppLayout} from '@/components/layout/AppLayout';

export default function WorkspaceHome(){
 const setup=useSetup(),{hash}=useLocation(),controls=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(hash==='#automatic-work'&&controls.current){controls.current.scrollIntoView({block:'start',behavior:'smooth'});}},[hash]);
 return <AppLayout><div className="workspace-home max-w-6xl">
  <header className="mb-7"><p className="workspace-eyebrow">YOUR MONEY, IN FOCUS</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">Your CFO briefing</h1><p className="text-muted-foreground mt-3 max-w-xl">The picture, the changes, and the few things that need you.</p></header>
  <div id="automatic-work" ref={controls} className="scroll-mt-6 mb-6"><AutopilotControl/></div>
  <CfoBriefing/>
  <nav className="grid sm:grid-cols-3 gap-3 mt-6" aria-label="Continue in Millie">{[['/transactions','Review transactions','Handle exceptions and teach repeat spending.'],['/receipts','Receipts & email','Connect evidence from any merchant.'],['/tools','All financial tools','Reports, plans, household and more.']].map(([href,title,description])=><Link key={href} to={href} className="workspace-tile"><div className="flex gap-3 items-center justify-between"><h2 className="font-semibold text-sm">{title}</h2><ArrowUpRight className="h-4 w-4 text-muted-foreground"/></div><p className="text-xs text-muted-foreground mt-2">{description}</p></Link>)}</nav>
  <Link to={setup.progress?.status==='finished'?'/context?tab=connections':'/setup'} className="flex items-center gap-3 py-6 mt-5 text-sm border-t"><CheckCheck className="h-4 w-4 text-primary"/><span className="flex-1">Connections &amp; next setup steps</span><ArrowRight className="h-4 w-4"/></Link>
 </div></AppLayout>;
}
