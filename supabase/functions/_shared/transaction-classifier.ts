// Shared, account-aware classification. No network calls or user-specific brand rules.
export const CLASSIFIER_VERSION='1.1';
export type Decision={category:string;kind:string;confidence:number;reason:string;review:boolean;income_type:string|null;merchant_key:string|null;match_id?:string|null};
const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function merchantKey(t:any){
 const text=norm(`${t.merchant_name||''} ${t.name||''}`),name=norm(t.merchant_name),m=t.provider_metadata||{};
 if(/\buber\s*(one|freight)\b/.test(text))return null;
 // A provider can reuse one entity ID for several different services.
 if(/\buber\b/.test(text)){
  if(/\buber\s*eats\b|\bubereats\b/.test(text))return 'service:uber-eats';
  if(/\b(one|membership|pass|freight)\b/.test(text))return null;
  if(/\b(trip|ride)\b/.test(text)||name==='uber')return 'service:uber-rides';
  return null;
 }
 if(/\bubereats\b/.test(text))return 'service:uber-eats';
 if(/^(venmo|paypal|zelle|cash app|square|stripe|payment|transfer|unknown)$/.test(name))return null;
 if(m.merchant_entity_id)return 'entity:'+m.merchant_entity_id;
 if(name)return 'merchant:'+name;
 const known=merchantTypes.find(([pattern])=>pattern.test(norm(t.name)));
 if(known){const match=norm(t.name).match(known[0]);if(match)return 'merchant:'+match[0];}
 return null;
}
const primary:Record<string,string>={FOOD_AND_DRINK:'Food & Dining',GENERAL_MERCHANDISE:'Shopping',GENERAL_SERVICES:'Services',TRANSPORTATION:'Transportation',TRAVEL:'Travel',RENT_AND_UTILITIES:'Bills & Utilities',HOME_IMPROVEMENT:'Home',MEDICAL:'Healthcare',ENTERTAINMENT:'Entertainment',RECREATION:'Entertainment',PERSONAL_CARE:'Personal Care',BANK_FEES:'Fees & Interest',GOVERNMENT_AND_NON_PROFIT:'Taxes & Giving'};
const confidence=(c:string)=>c==='VERY_HIGH'?.98:c==='HIGH'?.94:c==='MEDIUM'?.75:c==='LOW'?.45:.7;
// Small public merchant-type vocabulary supplements provider identity/MCC; it is
// not learned from one customer's ledger and never overrides payment semantics.
const merchantTypes:[RegExp,string][]=[[/\b(starbucks|dunkin|chipotle|mcdonalds|panera|sweetgreen|cava|shake shack|burger king)\b/,'Food & Dining'],[/\b(whole foods|trader joe s|kroger|safeway|publix|aldi)\b/,'Groceries'],[/\b(netflix|spotify|hulu)\b/,'Entertainment']];
export function classify(t:any,a:any,preferences:any[]=[]):Decision{
 const m=t.provider_metadata||{},d=m.detailed||t.subcategory||'',p=m.primary||[...Object.keys(primary),'INCOME','LOAN_PAYMENTS','TRANSFER_IN','TRANSFER_OUT'].find(k=>d===k||d.startsWith(k+'_'))||'',text=norm(t.name),merchant=norm(t.merchant_name),amount=Number(t.amount),key=merchantKey(t);const score=confidence(m.confidence);
 const result=(category:string,kind:string,c:number,reason:string,income:string|null=null):Decision=>({category,kind,confidence:c,reason,review:c<.9,income_type:income,merchant_key:key,match_id:null});
 if(t.classification_locked||['user','rule'].includes(t.classification_source))return result(t.category||'Other',t.classification_kind||'unknown',1,'Your confirmed classification is preserved.',t.income_type||null);
 if(t.linked_transfer_id)return {...result(t.category==='Credit Card Payment'?t.category:'Transfer','transfer',1,'Already linked to the other side of this movement.'),match_id:t.linked_transfer_id};
 const card=a?.type==='credit',cash=['checking','savings','depository'].includes(a?.type);
 // In Plaid, positive = money out; negative = money in (including card payments/refunds).
 const describedPayment=(card&&amount<0&&/\b(payment|pymt|pmt|autopay)\b/.test(text)&&!(/refund|return|reversal|cashback|cash back|reward/.test(text)))||(cash&&amount>0&&/\b(credit card|cardmember|card payment|card pmt)\b/.test(text));
 const providerPayment=d==='LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'||d==='TRANSFER_IN_CREDIT_CARD_PAYMENT';
 if(providerPayment||describedPayment){if(!((card&&amount<0)||(cash&&amount>0)))return result('Other','unknown',.4,'Card-payment evidence conflicts with the account or money direction.');return result('Credit Card Payment','card_payment',describedPayment?.97:m.confidence?score:.92,'Card-payment evidence and account direction: paying a card moves money; purchases were expenses already.');}
 const peer=/\b(venmo|zelle|cash app|paypal)\b/.test(text+' '+merchant)||/TRANSFER_(IN|OUT)_(CASH_ADVANCES_AND_LOANS|OTHER_TRANSFER)/.test(d);
 if(peer&&!m.merchant_entity_id&&!primary[p])return result(t.category&&!['Income','Transfer'].includes(t.category)?t.category:'Other','unknown',.45,'A payment platform does not establish whether this is income, spending, reimbursement or an internal transfer. Review the purpose.');
 if(/TRANSFER_(IN|OUT)_(ACCOUNT_TRANSFER|SAVINGS|INVESTMENT_AND_RETIREMENT_FUNDS)/.test(d))return result('Transfer','transfer',score,'Provider identifies movement between financial accounts; it is not earned income or consumption.');
 if(/\b(transfer|xfer)\b/.test(text)&&!peer&&/\b(checking|savings|brokerage|to account|from account|internal|online transfer)\b/.test(text))return result('Transfer','transfer',.92,'Description identifies an account-to-account movement.');
 if(p==='INCOME'||/^INCOME_/.test(d)||(/\b(payroll|salary|paycheck|direct dep payroll)\b/.test(text)&&cash)){
  if(amount>=0||card)return result('Other','unknown',.45,'Income evidence conflicts with money direction or account type; review before treating this as income.');
  const salary=/WAGES|SALARY/.test(d)||/payroll|salary|paycheck/.test(text);return result('Income','income',p==='INCOME'?score:.94,salary?'Payroll/wage evidence on an incoming cash transaction.':'Provider identifies an incoming income transaction.',salary?'salary':'other');
 }
 if(p==='LOAN_PAYMENTS')return result('Debt Payment','debt_payment',.75,'Loan payment: principal and interest need separation; do not treat the entire payment as a utility expense.');
 const learned=key&&(preferences.find(x=>x.merchant_key===key&&x.currency===(a?.currency||'USD'))||preferences.find(x=>x.merchant_key===key&&(!x.currency||x.currency==='*')));
 if(learned){const r=result(learned.category,amount<0?'refund':'expense',.98,'Uses your saved preference for this identified merchant.');
  if('auto_approve' in learned){const ordinary=learned.auto_approve&&amount>0&&amount<=Number(learned.max_amount)&&!t.is_one_time_expense&&!t.is_amortized&&!t.is_non_gaap_adjustment&&!t.is_transfer_exception&&!t.recognition_date&&!/\b(refund|return|reversal|chargeback)\b/.test(text);
   r.review=!ordinary;r.reason+=ordinary?' Within your approved routine amount limit.':!learned.auto_approve?' Automatic approval is paused; review this transaction.':' Review this exception: a refund, larger amount or special accounting treatment.';
  }return r;
 }
 let cat=primary[p],reason='Provider merchant/spending classification.',c=score;
 if(d==='FOOD_AND_DRINK_GROCERIES'){cat='Groceries';reason='Provider identifies groceries.';}
 const mcc=Number(m.mcc);if(mcc===5411){cat='Groceries';c=.96;reason='Merchant category code identifies a grocery store.';}else if([5811,5812,5813,5814].includes(mcc)){cat='Food & Dining';c=.96;reason='Merchant category code identifies food or dining.';}
 const known=key==='service:uber-eats'?[null,'Food & Dining'] as const:key==='service:uber-rides'?[null,'Transportation'] as const:merchantTypes.find(([pattern])=>pattern.test(merchant||text));if(known&&cat&&cat!==known[1]&&c>=.9)return result(known[1],amount<0?'refund':'expense',.8,'Recognized merchant type conflicts with the provider category; review this suggestion.');if(known&&(!cat||score<.9)){cat=known[1];c=.94;reason='Recognized merchant type, consistent with a purchase or merchant credit.';}
 if(cat){if(amount<0)return result(cat,'refund',c,reason+' Incoming merchant credits reduce spending in this category; they are not salary.');return result(cat,'expense',c,reason);}
 if(amount<0)return result(t.category&&t.category!=='Income'?t.category:'Other','unknown',.3,'Incoming money alone is not evidence of income: this could be a refund, reimbursement, loan or transfer. Existing non-income labels are retained until reviewed.');
 return result(t.category||'Other','expense',.3,'Existing category retained: there is insufficient evidence to recommend a better label.');
}
export function analyze(transactions:any[],accounts:any[],preferences:any[]=[]){
 const accountMap=new Map(accounts.map(a=>[a.id,a]));const decisions=new Map<string,Decision>();for(const t of transactions)decisions.set(t.id,classify(t,accountMap.get(t.account_id),preferences));
 // The bank-side description can be sparse. A connected card's institution or
 // last four digits plus payment wording and a unique opposite credit supplies context.
 for(const t of transactions){const a=accountMap.get(t.account_id);if(!a||!['checking','savings','depository'].includes(a.type)||Number(t.amount)<=0||t.pending||t.classification_locked||t.linked_transfer_id||t.is_transfer_exception||['user','rule'].includes(t.classification_source)||!(/\b(payment|epayment|pmt|pymt|autopay)\b/.test(norm(t.name))))continue;
  const hits=transactions.filter(o=>{const b=accountMap.get(o.account_id),d=decisions.get(o.id)!;if(!b||b.type!=='credit'||o.user_id!==t.user_id||o.pending||o.classification_locked||o.linked_transfer_id||o.is_transfer_exception||['user','rule'].includes(o.classification_source)||Number(o.amount)!==-Number(t.amount)||(b.currency||'USD')!==(a.currency||'USD')||Math.abs(Date.parse(o.date)-Date.parse(t.date))>5*86400000||d.kind!=='card_payment'||d.confidence<.9)return false;const label=norm(b.provider_institution_name),text=norm(t.name);return (label.length>=4&&text.includes(label))||(b.mask&&new RegExp('\\b'+String(b.mask).replace(/[^0-9]/g,'')+'\\b').test(text));});
  if(hits.length===1)decisions.set(t.id,{category:'Credit Card Payment',kind:'card_payment',confidence:.95,reason:'Payment wording references your connected card and agrees with its opposite payment entry.',review:false,income_type:null,merchant_key:null,match_id:null});
 }
 const eligible=(t:any)=>!t.pending&&!t.linked_transfer_id&&!t.is_transfer_exception&&!t.classification_locked&&!['user','rule'].includes(t.classification_source)&&['transfer','card_payment'].includes(decisions.get(t.id)!.kind)&&decisions.get(t.id)!.confidence>=.9&&accountMap.has(t.account_id);
 const candidates=new Map<string,any[]>();const moves=transactions.filter(eligible);
 const buckets=new Map<string,any[]>();for(const t of moves){const a=accountMap.get(t.account_id),k=t.user_id+'|'+(a.currency||'USD')+'|'+Math.round(Math.abs(Number(t.amount))*100);buckets.set(k,[...(buckets.get(k)||[]),t]);}
 for(const group of buckets.values())for(const t of group){const a=accountMap.get(t.account_id);candidates.set(t.id,group.filter(o=>{const b=accountMap.get(o.account_id);if(o.id===t.id||o.account_id===t.account_id||Math.sign(Number(o.amount))===Math.sign(Number(t.amount))||Math.abs(Date.parse(o.date)-Date.parse(t.date))>5*86400000)return false;const card=decisions.get(t.id)!.kind==='card_payment'||decisions.get(o.id)!.kind==='card_payment';return !card||((a.type==='credit'&&Number(t.amount)<0&&['checking','savings','depository'].includes(b.type)&&Number(o.amount)>0)||(b.type==='credit'&&Number(o.amount)<0&&['checking','savings','depository'].includes(a.type)&&Number(t.amount)>0));}));}
 for(const t of moves){const matches=candidates.get(t.id)||[],d=decisions.get(t.id)!;if(matches.length===1&&(candidates.get(matches[0].id)||[]).length===1){d.match_id=matches[0].id;d.reason+=' Matched uniquely to the opposite entry in another account: same owner, currency, exact amount and within five days.';}else if(matches.length>1){d.review=true;d.reason+=' Multiple possible matching entries: choose the correct counterpart.';}else d.reason+=' The other side is not uniquely identified; no link was invented.';}
 return decisions;
}
