import {type ReactNode} from 'react';
import {Link,useLocation,Navigate} from 'react-router-dom';
import {useModules} from '@/hooks/useModules';
import {MODULES,moduleForPath} from '@/lib/modules';
import {AppLayout} from './AppLayout';
import {Button} from '@/components/ui/button';

// Mounted outside page components: disabled workspaces do not mount their UI or
// invoke page effects. This is a preference boundary; RLS remains authorization.
export function ModuleAccess({children}:{children:ReactNode}){
  const m=useModules();const {pathname,search}=useLocation();const id=moduleForPath(pathname);
  if(pathname==='/analytics'&&['goals','projects'].includes(new URLSearchParams(search).get('view')||''))return <Navigate to={'/goals?tab='+new URLSearchParams(search).get('view')} replace/>;
  if(m.loading)return <div role="status" className="p-8">Loading your workspace…</div>;
  if(m.error)return <div role="alert" className="p-8 space-y-3"><p>{m.error}</p><Button onClick={m.retry}>Retry</Button></div>;
  if(id&&!m.isEnabled(id))return <AppLayout><div className="max-w-xl rounded-2xl border bg-card p-6 space-y-4"><h1 className="text-2xl font-semibold">{MODULES.find(x=>x.id===id)?.name} is off</h1><p className="text-muted-foreground">Your records and historical calculations are preserved. Enable this module to use its tools again.</p><div className="flex gap-3"><Button asChild><Link to="/customize">Customize Millie</Link></Button><Button asChild variant="outline"><Link to="/">Go to overview</Link></Button></div></div></AppLayout>;
  return <>{children}</>;
}
