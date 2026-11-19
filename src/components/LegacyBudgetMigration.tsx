import {confirmAction} from '@/components/ui/confirm-action';
import {useEffect,useState} from 'react';
import {financeDb,useHousehold} from '@/hooks/useHousehold';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
export function LegacyBudgetMigration(){
 const {user}=useAuth();const {reload}=useHousehold();const [rows,setRows]=useState<any[]>([]),[month,setMonth]=useState(new Date().toISOString().slice(0,7)),[busy,setBusy]=useState(false);
 useEffect(()=>{if(user)void financeDb.from('budgets').select('*').eq('user_id',user.id).then(({data,error}:any)=>{if(!error)setRows((data||[]).map((b:any)=>({...b,monthly:Number(b.monthly_limit)/(b.period==='yearly'?12:1)})));});},[user?.id]);
 if(!rows.length)return null;
 return <details className="border rounded-lg p-4 mt-4"><summary className="cursor-pointer font-medium">Review older budget targets</summary><p className="text-sm my-3">Copy a reviewed target into your personal USD dated budget. Annual targets are divided by 12; verify currency and seasonality. Existing targets in the same month will be replaced. Original budgets remain available.</p><Input aria-label="Migrated budget starting month" type="month" min={new Date().toISOString().slice(0,7)} value={month} onChange={e=>setMonth(e.target.value)}/>{rows.map((b,i)=><div key={b.id} className="flex flex-wrap gap-3 items-center mt-3"><span>{b.category} · formerly {b.period||'monthly'}</span><Input className="w-32" aria-label={b.category+' monthly target'} type="number" min="0" step="0.01" value={b.monthly} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x,monthly:Number(e.target.value)}:x))}/><Button variant="outline" disabled={busy||!month||b.monthly<0} onClick={async()=>{if(!await confirmAction(`Save ${b.category}: USD ${b.monthly.toFixed(2)} per month for your personal view from ${month}?`))return;setBusy(true);const r=await financeDb.rpc('finance_save_budget',{_category:b.category,_view:'mine',_currency:'USD',_month:month+'-01',_amount:Math.round(b.monthly*100)/100});setBusy(false);if(r.error)return toast.error(r.error.message);await reload();toast.success('Dated target saved');}}>Confirm target</Button></div>)}</details>;
}
