import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {useHousehold,financeDb} from '@/hooks/useHousehold';
import {AppLayout} from '@/components/layout/AppLayout';
import {PageHeader} from '@/components/ui/page-header';
import {FinanceTable} from '@/components/ui/finance-table';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
export default function AssetRegister(){
 const h=useHousehold(),{user}=useAuth();const [snapshots,setSnapshots]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setSnapshots([]);setError('');if(user)void financeDb.from('balance_sheet_snapshots').select('id,snapshot_date,total_assets,total_liabilities,total_equity').eq('user_id',user.id).order('snapshot_date',{ascending:false}).then(({data,error})=>{if(!active)return;if(error)setError('Saved legacy snapshots could not load.');else setSnapshots(data||[]);});return()=>{active=false;};},[user?.id]);
 const number=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
 return <AppLayout><PageHeader title="Manual assets & saved snapshots" description="Source records retained separately from the dated financial statements." actions={<Button asChild><Link to="/balance-sheet">Open authoritative balance sheet</Link></Button>}/>
 {h.loading?<p>Loading source records…</p>:h.error?<p role="alert">{h.error}</p>:<Card><CardHeader><CardTitle>Manual source values</CardTitle></CardHeader><CardContent className="space-y-3"><FinanceTable headers={['Name','Type','Asset / liability','Saved value','Notes']} rows={(h.data.assets||[]).filter(a=>a.user_id===user?.id).map(a=>[a.name,a.type,a.is_liability?'Liability':'Asset',number(Number(a.value)),a.notes||'—'])}/><p className="text-sm text-muted-foreground">These legacy records do not identify currency or a valuation date. They remain available in the balance sheet’s separate latest-position section; they are not backfilled into historical statements. Dated purchase and obligation schedules are managed in Assets, bills & timing.</p><Button asChild variant="outline"><Link to="/amortization">Assets, bills & timing</Link></Button></CardContent></Card>}
 <Card className="mt-6"><CardHeader><CardTitle>Legacy balance snapshots · as saved</CardTitle></CardHeader><CardContent>{error?<p role="alert">{error}</p>:<FinanceTable headers={['Saved date','Assets','Liabilities','Net worth']} rows={snapshots.map(s=>[s.snapshot_date,number(Number(s.total_assets)),number(Number(s.total_liabilities)),number(Number(s.total_equity))])}/>}<p className="text-sm text-muted-foreground mt-3">Original saved totals are preserved. Their currency, scope and calculation version were not captured, so they are not merged into the new reconciled statements. Record dated balances on the balance sheet and hold completed periods in Period closes.</p></CardContent></Card>
 </AppLayout>;
}
