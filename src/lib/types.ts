export type Account = {
  id: string;
  user_id: string;
  plaid_account_id?: string;
  name: string;
  official_name?: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'loan';
  subtype?: string;
  mask?: string;
  current_balance: number;
  available_balance?: number;
  currency: string;
  is_manual: boolean;
  is_joint: boolean;
  ownership_pct?: number | null;
  joint_start_date?: string | null;
  joint_end_date?: string | null;
  is_zero_balance?: boolean;
  created_at: string;
  updated_at: string;
};

export type PartnerProfile = {
  id: string;
  user_id: string;
  partner_name: string;
  default_ownership_pct: number;
  created_at: string;
  updated_at: string;
};

export type CashFlowCategory = 'operating' | 'other';

export type IncomeType = 'salary' | 'other';

export type Transaction = {
  id: string;
  user_id: string;
  account_id?: string;
  account_name?: string;
  plaid_transaction_id?: string;
  amount: number;
  date: string;
  recognition_date?: string;
  name: string;
  merchant_name?: string;
  category?: string;
  subcategory?: string;
  cash_flow_type: CashFlowCategory;
  is_one_time_expense: boolean;
  is_non_gaap_adjustment: boolean;
  is_amortized: boolean;
  non_gaap_category?: string;
  notes?: string;
  pending: boolean;
  income_type?: IncomeType;
  linked_transfer_id?: string;
  is_transfer_exception?: boolean;
  ownership_pct?: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

export type BudgetPeriod = 'monthly' | 'yearly';

export type BudgetScope = 'all' | 'personal' | 'joint';

export type Budget = {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  period: BudgetPeriod;
  budget_scope: BudgetScope;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AmortizationType = 'prepaid_expense' | 'capital_expenditure' | 'intangible_asset' | 'deferred_income';

export type AmortizationSchedule = {
  id: string;
  user_id: string;
  transaction_id?: string;
  name: string;
  description?: string;
  type: AmortizationType;
  total_amount: number;
  start_date: string;
  end_date: string;
  monthly_amount: number;
  category?: string;
  is_active: boolean;
  is_one_time: boolean;
  created_at: string;
  updated_at: string;
};

export type Asset = {
  id: string;
  user_id: string;
  name: string;
  type: 'property' | 'vehicle' | 'investment' | 'cash' | 'other';
  value: number;
  is_liability: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type NonGAAPCategory = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
};

export type PlaidItem = {
  id: string;
  user_id: string;
  access_token: string;
  item_id: string;
  institution_id?: string;
  institution_name?: string;
  cursor?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
};

export type TransactionRule = {
  id: string;
  user_id: string;
  name: string;
  match_text: string;
  match_type: 'contains' | 'starts_with' | 'exact';
  category?: string;
  cash_flow_type?: CashFlowCategory;
  is_one_time_expense: boolean;
  amortize_months?: number;
  amortize_type?: AmortizationType;
  income_type?: IncomeType;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type RecurringTransaction = {
  id: string;
  user_id: string;
  name: string;
  merchant_name?: string;
  expected_amount: number;
  frequency: RecurringFrequency;
  category?: string;
  last_seen_date?: string;
  next_expected_date?: string;
  last_amount?: number;
  is_active: boolean;
  is_auto_detected: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type Event = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color: string;
  is_active: boolean;
  event_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionEvent = {
  id: string;
  transaction_id: string;
  event_id: string;
  created_at: string;
};
