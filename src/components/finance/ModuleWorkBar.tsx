import {Link,useLocation,useSearchParams} from 'react-router-dom';import {Sparkles,UserRound} from 'lucide-react';
import {useAutomation} from '@/hooks/useAutomation';import {moduleForPath} from '@/lib/modules';
export function ModuleWorkBar(){
 const {pathname}=useLocation(),[params]=useSearchParams(),a=useAutomation();
 const module=pathname==='/setup'?(params.get('module')==='foundation'?'transactions':params.get('module')):['/transactions','/accounts','/transaction-rules'].includes(pathname)?'transactions':moduleForPath(pathname);
 if(!module||pathname==='/customize'||pathname==='/assistant')return null;
 const ai=a.policy(module).mode==='ai';
 return <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 mb-5 text-sm"><span className="flex items-center gap-2 font-medium">{ai?<Sparkles className="h-4 w-4 text-primary"/>:<UserRound className="h-4 w-4"/>}{a.loading?'Loading working mode…':ai?'AI mode':'Manual mode'}</span><span className="text-muted-foreground flex-1">{ai?'Let AI handle enabled tasks; use the tools below whenever you want.':'Guided tools and your decisions. Switch to AI whenever you want help.'}</span>{ai&&<Link className="text-primary underline" to={'/assistant?module='+module}>Review AI work</Link>}<Link className="text-xs underline" to={'/customize#mode-'+module}>Change mode</Link></div>;
}
