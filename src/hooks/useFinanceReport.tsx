import {useState,useEffect,useMemo} from 'react';
import {previousCalendarPeriod} from '@/lib/reporting-periods';
import {useAuth} from './useAuth';
import {useHousehold} from './useHousehold';
import {analyticalReport,reportingPeriod,type FinanceView,type HistoryBasis,type ReportOptions} from '@/lib/household-finance';
import {accountingReport,selectReport,type ReportEdition} from '@/lib/reporting-engine';
export function useFinanceReport(){
 const {user}=useAuth();const state=useHousehold();const key='millie-analyst:'+user?.id;
 const initial={view:'mine' as FinanceView,basis:'recorded' as HistoryBasis,month:new Date().toISOString().slice(0,7),period:'month',currency:'USD',normalized:false,scope:'',proformaPct:50,comparison:'year',partial:true,edition:'latest' as ReportEdition,closeId:''};
 const [prefs,setPrefs]=useState(()=>{try{return {...initial,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return initial;}});
 useEffect(()=>{const sync=()=>{try{setPrefs({...initial,...JSON.parse(localStorage.getItem(key)||'{}')});}catch{setPrefs(initial);}};const query=new URLSearchParams(window.location.search);const patch:any={};if(['normalized','recorded'].includes(query.get('activity')||''))patch.normalized=query.get('activity')==='normalized';if(['mine','partner','household'].includes(query.get('view')||''))patch.view=query.get('view');if(['recorded','comparable','proforma'].includes(query.get('basis')||''))patch.basis=query.get('basis');if(query.get('briefing')==='1'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(query.get('month')||'')&&['month','quarter'].includes(query.get('period')||'')&&/^[A-Z]{3}$/.test(query.get('currency')||'')){Object.assign(patch,{month:query.get('month'),period:query.get('period'),currency:query.get('currency'),comparison:'previous',scope:'',edition:'latest',closeId:'',normalized:false,partial:true});}if(Object.keys(patch).length){try{localStorage.setItem(key,JSON.stringify({...initial,...JSON.parse(localStorage.getItem(key)||'{}'),...patch}));}catch{}}sync();window.addEventListener('millie-report-change',sync);return()=>window.removeEventListener('millie-report-change',sync);},[key]);
 const update=(changes:Partial<typeof initial>)=>{const next={...prefs,...changes};setPrefs(next);localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event('millie-report-change'));};
 const scope=state.data.documents?.find(d=>d.id===prefs.scope&&d.kind==='scope');
 const bounds=reportingPeriod(prefs.month,prefs.period);const today=new Date().toISOString().slice(0,10);if(prefs.partial&&bounds.end>today&&bounds.start<=today)bounds.end=today;
 let priorStart:string,priorEnd:string;
 if(prefs.comparison==='previous'&&['month','quarter','year'].includes(prefs.period)){({priorStart,priorEnd}=previousCalendarPeriod(bounds.start,bounds.end,prefs.period==='quarter'?3:prefs.period==='year'?12:1));}else if(prefs.comparison==='previous') {const duration=Math.round((Date.parse(bounds.end)-Date.parse(bounds.start))/86400000);const d=new Date(bounds.start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);priorEnd=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()-duration);priorStart=d.toISOString().slice(0,10);}else {const shift=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return `${y-1}-${String(m).padStart(2,'0')}-${String(Math.min(d,new Date(y-1,m,0).getDate())).padStart(2,'0')}`;};priorStart=shift(bounds.start);priorEnd=shift(bounds.end);}
 const options:ReportOptions={userId:user?.id||'',partnerId:state.partnerId,linkId:state.linkId,view:prefs.view,basis:prefs.basis,currency:prefs.currency,...bounds,normalized:prefs.normalized,accountIds:scope?.payload.accountIds,proformaPct:Number(prefs.proformaPct)};
 const selectedClose=state.data.documents?.find(d=>d.id===prefs.closeId&&d.kind==='close'&&d.owner_id===user?.id);
 const selection=useMemo(()=>selectReport(state.data,options,prefs.edition,selectedClose),[state.data,JSON.stringify(options),prefs.edition,selectedClose]);
 const current=useMemo(()=>prefs.edition==='latest'&&selection.report?selection.report:accountingReport(state.data,options),[state.data,JSON.stringify(options),selection,prefs.edition]);
 return {...state,user,prefs,update,options,scope,result:current.result,package:current,selection,selectedClose,prior:analyticalReport(state.data,{...options,start:priorStart,end:priorEnd}),priorStart,priorEnd};
}
