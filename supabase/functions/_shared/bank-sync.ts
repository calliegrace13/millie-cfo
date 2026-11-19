import {classifyOwner} from './classification-service.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Check if origin is allowed - accepts all Lovable project domains
function isAllowedOrigin(origin: string): boolean {
  const allowed = (Deno.env.get('MILLIE_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Map errors to safe client messages
function mapErrorToClient(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return 'Authentication failed. Please log in again.';
    }
    if (message.includes('token_encryption_key')) {
      return 'Service configuration error. Please contact support.';
    }
    if (message.includes('item_login_required') || message.includes('login required')) {
      return 'Please reconnect your bank account.';
    }
    if (message.includes('rate limit')) {
      return 'Too many requests. Please try again later.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Connection error. Please check your network and try again.';
    }
  }
  
  return 'An error occurred. Please try again later.';
}

// Validate and sanitize string input
function sanitizeString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength);
}

// Validate numeric input
function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

// Validate date format (YYYY-MM-DD)
function sanitizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return null;
  // Verify it's a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return value;
}

// Decrypt access token using AES-GCM
async function decryptToken(encryptedToken: string): Promise<string> {
  const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  
  // If not encrypted (legacy tokens), require encryption key and fail
  if (!encryptedToken.startsWith('enc:')) throw new Error('Unencrypted bank token rejected');

  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be configured - cannot decrypt encrypted token');
  }

  try {
    const combined = decodeBase64(encryptedToken.slice(4)); // Remove 'enc:' prefix
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(encryptionKey),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {

    throw new Error('Failed to decrypt access token');
  }
}

// Map Plaid personal_finance_category to app categories
// For TRANSFER_IN/TRANSFER_OUT, only categorize as "Transfer" if the transaction name contains "transfer"
// (e.g. "Standard transfer" for Venmo→bank moves). P2P payments should keep their natural category.
function mapPlaidCategory(plaidCategory: string | undefined, txName?: string): string {
  if (!plaidCategory) return 'Other';
  
  if (plaidCategory === 'TRANSFER_IN' || plaidCategory === 'TRANSFER_OUT') {
    const nameLower = (txName || '').toLowerCase();
    if (nameLower.includes('transfer')) {
      return 'Transfer';
    }
    return 'Other';
  }
  
  const mapping: Record<string, string> = {
    'FOOD_AND_DRINK': 'Food & Dining',
    'GENERAL_MERCHANDISE': 'Shopping',
    'GENERAL_SERVICES': 'Shopping',
    'TRANSPORTATION': 'Transportation',
    'TRAVEL': 'Travel',
    'RENT_AND_UTILITIES': 'Bills & Utilities',
    'HOME_IMPROVEMENT': 'Bills & Utilities',
    'MEDICAL': 'Healthcare',
    'ENTERTAINMENT': 'Entertainment',
    'RECREATION': 'Entertainment',
    'PERSONAL_CARE': 'Healthcare',
    'INCOME': 'Income',
    'LOAN_PAYMENTS': 'Other',
    'BANK_FEES': 'Bills & Utilities',
    'GOVERNMENT_AND_NON_PROFIT': 'Other',
  };
  
  return mapping[plaidCategory] || 'Other';
}

// Transaction rule type
interface TransactionRule {
  id: string;
  match_text: string;
  match_type: 'contains' | 'starts_with' | 'exact';
  category: string | null;
  cash_flow_type: string | null;
  is_one_time_expense: boolean;
  amortize_months: number | null;
  amortize_type: string | null;
  priority: number;
}

// Apply rules to a transaction and return updates
function applyRules(
  name: string, 
  merchantName: string | null, 
  rules: TransactionRule[]
): Record<string, unknown> {
  const txText = `${name} ${merchantName || ''}`.toLowerCase();
  
  for (const rule of rules) {
    // Split match_text by comma to support multiple phrases
    const phrases = rule.match_text.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    let matches = false;
    for (const phrase of phrases) {
      switch (rule.match_type) {
        case 'contains':
          matches = txText.includes(phrase);
          break;
        case 'starts_with':
          matches = txText.startsWith(phrase);
          break;
        case 'exact':
          matches = txText.trim() === phrase;
          break;
      }
      if (matches) break; // Stop at first matching phrase
    }

    if (matches) {
      const updates: Record<string, unknown> = {};
      if (rule.category) {updates.category = rule.category;updates.classification_source='rule';}
      if (rule.cash_flow_type) updates.cash_flow_type = rule.cash_flow_type;
      if (rule.is_one_time_expense) updates.is_one_time_expense = true;
      return updates;
    }
  }
  
  return {};
}

// Validate a transaction from Plaid
interface ValidatedTransaction {
  transaction_id: string;
  pending_transaction_id: string | null;
  account_id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  pending: boolean;
  category: string;
  plaid_primary_category: string | null;
  subcategory: string | null;
  provider_metadata: Record<string,unknown>;
}

function validateTransaction(tx: any): ValidatedTransaction | null {
  // Required fields
  const transactionId = sanitizeString(tx.transaction_id, 100);
  const accountId = sanitizeString(tx.account_id, 100);
  const name = sanitizeString(tx.name, 500);
  const amount = sanitizeNumber(tx.amount);
  const date = sanitizeDate(tx.date);
  
  if (!transactionId || !accountId || !name || amount === null || !date) {
    console.warn('Skipping invalid transaction:', {
      hasTransactionId: !!transactionId,
      hasAccountId: !!accountId,
      hasName: !!name,
      hasAmount: amount !== null,
      hasDate: !!date,
    });
    return null;
  }
  
  return {
    transaction_id: transactionId,
    pending_transaction_id: sanitizeString(tx.pending_transaction_id, 100),
    account_id: accountId,
    name,
    merchant_name: sanitizeString(tx.merchant_name, 500),
    amount,
    date,
    pending: typeof tx.pending === 'boolean' ? tx.pending : false,
    provider_metadata:{primary:sanitizeString(tx.personal_finance_category?.primary,100),detailed:sanitizeString(tx.personal_finance_category?.detailed,150),confidence:sanitizeString(tx.personal_finance_category?.confidence_level,30),merchant_entity_id:sanitizeString(tx.merchant_entity_id,150),mcc:sanitizeString(String(tx.merchant_category_code||''),6),payment_channel:sanitizeString(tx.payment_channel,30)},
    category: mapPlaidCategory(tx.personal_finance_category?.primary, name || undefined),
    plaid_primary_category: sanitizeString(tx.personal_finance_category?.primary, 100),
    subcategory: sanitizeString(tx.personal_finance_category?.detailed || tx.category?.[1], 200),
  };
}


export async function syncItem(db:any,item:any,start?:string,end?:string) {
 const claim=await db.rpc('finance_sync_claim',{_item:item.id});if(claim.error)throw claim.error;
 if(!claim.data)return {synced:0,busy:true};const lease=claim.data;
 let synced=0;
 try {
  const token=await decryptToken(item.access_token);
  const env=Deno.env.get('PLAID_ENV')||'production';
  if(!['production','sandbox','development'].includes(env))throw Error('Service configuration error');
  const call=async(path:string,body:any)=>{
   const r=await fetch('https://'+env+'.plaid.com'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:Deno.env.get('PLAID_CLIENT_ID'),secret:Deno.env.get('PLAID_SECRET'),access_token:token,...body}),signal:AbortSignal.timeout(25000)});
   const data=await r.json();if(!r.ok||data.error_code)throw Error(data.error_code||'Bank request failed');return data;
  };
  const rulesResult=await db.from('transaction_rules').select('*').eq('user_id',item.user_id).eq('is_active',true).order('priority',{ascending:false});if(rulesResult.error)throw rulesResult.error;
  const validate=(list:any[])=>list.map(tx=>{const v=validateTransaction(tx);if(!v)throw Error('Invalid bank transaction');return {...v,...applyRules(v.name,v.merchant_name,rulesResult.data||[])};});
  let cursor=item.cursor||undefined,offset=0,more=true,pages=0;
  const allAdded:any[]=[],allModified:any[]=[],allRemoved:any[]=[];
  while(more&&pages<20){
   const data=start&&end?await call('/transactions/get',{start_date:start,end_date:end,options:{count:500,offset}}):await call('/transactions/sync',{cursor,count:500});
   const added=validate(data.transactions||data.added||[]),modified=validate(data.modified||[]);
   allAdded.push(...added);allModified.push(...modified);allRemoved.push(...(data.removed||[]));
   cursor=data.next_cursor;offset+=added.length;more=start?offset<data.total_transactions:!!data.has_more;pages++;
   if(start&&more&&!added.length)throw Error('Incomplete bank import');
  }
  if(more)throw Error('Import exceeds a single run. Request a smaller history window.');
  // Commit the complete pagination sequence and final cursor atomically. If
  // Plaid invalidates pagination, retry starts from the unchanged saved cursor.
  const applied=await db.rpc('finance_apply_sync_page',{_item:item.id,_lease:lease,_added:allAdded,_modified:allModified,_removed:allRemoved,_cursor:start?null:cursor});if(applied.error)throw applied.error;synced+=applied.data;
  // Cached balances avoid a paid real-time balance request every scheduled run.
  const balances=await call('/accounts/get',{});
  for(const a of balances.accounts||[]){const r=await db.from('accounts').update({provider_institution_id:item.institution_id||null,provider_institution_name:item.institution_name||null,current_balance:sanitizeNumber(a.balances?.current),available_balance:sanitizeNumber(a.balances?.available)}).eq('user_id',item.user_id).eq('plaid_account_id',a.account_id).or('is_deleted.is.null,is_deleted.eq.false');if(r.error)throw r.error;}
  // Categorization can retry independently; a completed bank import stays committed.
  try{await classifyOwner(db,item.user_id,true);}catch{console.warn('Categorization pending; retry on next sync or in Transactions.');}
  const done=await db.rpc('finance_sync_finish',{_item:item.id,_lease:lease,_error:null});if(done.error)throw done.error;
  return {synced};
 } catch(e) {
  const raw=e instanceof Error?e.message:'';
  const message=raw.includes('ITEM_LOGIN_REQUIRED')?'Reconnect your bank in Accounts to resume syncing.':raw.includes('PRODUCT_NOT_READY')?'Your bank is preparing transaction history. Millie will retry automatically.':'Bank sync did not finish. Your last successful import is unchanged. Retry in Accounts.';
  const done=await db.rpc('finance_sync_finish',{_item:item.id,_lease:lease,_error:message});if(done.error)throw done.error;
  return {synced,error:message};
 }
}

// Refresh institution labels only; does not refresh balances or transactions.
export async function refreshInstitutionLabels(db:any,item:any) {
 const token=await decryptToken(item.access_token);
 const env=Deno.env.get('PLAID_ENV')||'production';
 const response=await fetch('https://'+env+'.plaid.com/accounts/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:Deno.env.get('PLAID_CLIENT_ID'),secret:Deno.env.get('PLAID_SECRET'),access_token:token}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Institution labels unavailable');
 const result=await response.json();
 for(const account of result.accounts||[]){const saved=await db.from('accounts').update({provider_institution_id:item.institution_id||null,provider_institution_name:item.institution_name||null}).eq('user_id',item.user_id).eq('plaid_account_id',account.account_id);if(saved.error)throw new Error('Unable to save institution label');}
}
