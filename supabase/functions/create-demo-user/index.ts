import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@millieceo.app";
const DEMO_PASSWORD = "demo1234";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split("T")[0];
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

async function clearDemoData(supabase: any, userId: string) {
  // Delete in dependency order
  const tables = [
    "ceo_tasks",
    "balance_sheet_snapshots",
    "investment_holdings",
    "digital_subscriptions",
    "credit_cards",
    "recurring_transactions",
    "assets",
    "financial_goals",
    "budgets",
    "transactions",
    "accounts",
  ];
  for (const table of tables) {
    await supabase.from(table).delete().eq("user_id", userId);
  }
}

async function seedDemoData(supabase: any, userId: string) {
  // Always clean and re-seed for fresh demo experience
  await clearDemoData(supabase, userId);

  // ── Accounts ──
  const accounts = [
    { id: "d0000001-0000-0000-0000-000000000001", user_id: userId, name: "Chase Checking", type: "depository", subtype: "checking", current_balance: 8425.33, available_balance: 8425.33, is_manual: false, is_joint: false, mask: "4521" },
    { id: "d0000001-0000-0000-0000-000000000002", user_id: userId, name: "Ally Savings", type: "depository", subtype: "savings", current_balance: 32150.00, available_balance: 32150.00, is_manual: false, is_joint: false, mask: "7890" },
    { id: "d0000001-0000-0000-0000-000000000003", user_id: userId, name: "Chase Sapphire Reserve", type: "credit", subtype: "credit card", current_balance: -2847.56, available_balance: 27152.44, is_manual: false, is_joint: false, mask: "1234" },
    { id: "d0000001-0000-0000-0000-000000000004", user_id: userId, name: "Amex Gold", type: "credit", subtype: "credit card", current_balance: -1205.89, available_balance: 18794.11, is_manual: false, is_joint: false, mask: "5678" },
    { id: "d0000001-0000-0000-0000-000000000005", user_id: userId, name: "Fidelity 401k", type: "investment", subtype: "401k", current_balance: 87500.00, available_balance: null, is_manual: false, is_joint: false, mask: "3456" },
    { id: "d0000001-0000-0000-0000-000000000006", user_id: userId, name: "Joint Checking", type: "depository", subtype: "checking", current_balance: 5200.00, available_balance: 5200.00, is_manual: false, is_joint: true, ownership_pct: 50, mask: "9012" },
    { id: "d0000001-0000-0000-0000-000000000007", user_id: userId, name: "Auto Loan", type: "loan", subtype: "auto", current_balance: -18750.00, available_balance: null, is_manual: false, is_joint: false, mask: "6543" },
  ];

  const { error: accErr } = await supabase.from("accounts").insert(accounts);
  if (accErr) console.error("accounts insert error:", accErr);

  // ── Transactions (last 90 days, comprehensive) ──
  const txns = [
    // Income - biweekly paychecks
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(1), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(15), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(31), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(45), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(61), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Payroll Direct Deposit", amount: -5200.00, date: daysAgo(75), category: "Income", merchant_name: "Employer Inc", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "salary", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Dividend Payment", amount: -185.50, date: daysAgo(10), category: "Income", merchant_name: "Fidelity", account_id: accounts[4].id, account_name: "Fidelity 401k", income_type: "other", cash_flow_type: "investing", needs_review: false },
    { user_id: userId, name: "Freelance Project", amount: -1500.00, date: daysAgo(22), category: "Income", merchant_name: "Client Co", account_id: accounts[0].id, account_name: "Chase Checking", income_type: "other", cash_flow_type: "operating", needs_review: false },

    // Rent
    { user_id: userId, name: "Rent Payment", amount: 2200.00, date: daysAgo(2), category: "Rent", merchant_name: "Landlord LLC", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Rent Payment", amount: 2200.00, date: daysAgo(32), category: "Rent", merchant_name: "Landlord LLC", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Rent Payment", amount: 2200.00, date: daysAgo(62), category: "Rent", merchant_name: "Landlord LLC", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },

    // Utilities
    { user_id: userId, name: "Electric Bill", amount: 142.30, date: daysAgo(5), category: "Utilities", merchant_name: "Con Edison", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Electric Bill", amount: 138.50, date: daysAgo(35), category: "Utilities", merchant_name: "Con Edison", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Internet", amount: 79.99, date: daysAgo(7), category: "Utilities", merchant_name: "Spectrum", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Internet", amount: 79.99, date: daysAgo(37), category: "Utilities", merchant_name: "Spectrum", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Cell Phone", amount: 85.00, date: daysAgo(12), category: "Utilities", merchant_name: "T-Mobile", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Cell Phone", amount: 85.00, date: daysAgo(42), category: "Utilities", merchant_name: "T-Mobile", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },

    // Groceries
    { user_id: userId, name: "Whole Foods Market", amount: 127.45, date: daysAgo(2), category: "Groceries", merchant_name: "Whole Foods", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Trader Joe's", amount: 68.92, date: daysAgo(6), category: "Groceries", merchant_name: "Trader Joe's", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Whole Foods Market", amount: 94.33, date: daysAgo(9), category: "Groceries", merchant_name: "Whole Foods", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Costco", amount: 215.67, date: daysAgo(14), category: "Groceries", merchant_name: "Costco", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Trader Joe's", amount: 52.18, date: daysAgo(20), category: "Groceries", merchant_name: "Trader Joe's", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Whole Foods Market", amount: 108.90, date: daysAgo(28), category: "Groceries", merchant_name: "Whole Foods", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Trader Joe's", amount: 73.25, date: daysAgo(34), category: "Groceries", merchant_name: "Trader Joe's", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Costco", amount: 198.40, date: daysAgo(44), category: "Groceries", merchant_name: "Costco", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Whole Foods Market", amount: 115.60, date: daysAgo(55), category: "Groceries", merchant_name: "Whole Foods", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },

    // Dining
    { user_id: userId, name: "Sweetgreen", amount: 16.50, date: daysAgo(1), category: "Food & Drink", merchant_name: "Sweetgreen", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Nobu", amount: 285.00, date: daysAgo(4), category: "Food & Drink", merchant_name: "Nobu", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Starbucks", amount: 6.75, date: daysAgo(3), category: "Food & Drink", merchant_name: "Starbucks", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "DoorDash", amount: 42.30, date: daysAgo(8), category: "Food & Drink", merchant_name: "DoorDash", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Chipotle", amount: 14.25, date: daysAgo(11), category: "Food & Drink", merchant_name: "Chipotle", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Starbucks", amount: 5.95, date: daysAgo(13), category: "Food & Drink", merchant_name: "Starbucks", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Sweetgreen", amount: 17.25, date: daysAgo(17), category: "Food & Drink", merchant_name: "Sweetgreen", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Uber Eats", amount: 38.90, date: daysAgo(24), category: "Food & Drink", merchant_name: "Uber Eats", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Le Bernardin", amount: 342.00, date: daysAgo(40), category: "Food & Drink", merchant_name: "Le Bernardin", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Starbucks", amount: 7.45, date: daysAgo(50), category: "Food & Drink", merchant_name: "Starbucks", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },

    // Transportation
    { user_id: userId, name: "Shell Gas", amount: 52.40, date: daysAgo(3), category: "Transportation", merchant_name: "Shell", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Uber", amount: 24.50, date: daysAgo(6), category: "Transportation", merchant_name: "Uber", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Shell Gas", amount: 48.75, date: daysAgo(18), category: "Transportation", merchant_name: "Shell", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Uber", amount: 32.00, date: daysAgo(30), category: "Transportation", merchant_name: "Uber", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Auto Loan Payment", amount: 485.00, date: daysAgo(5), category: "Auto Payment", merchant_name: "Capital One Auto", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "financing", needs_review: false },
    { user_id: userId, name: "Auto Loan Payment", amount: 485.00, date: daysAgo(35), category: "Auto Payment", merchant_name: "Capital One Auto", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "financing", needs_review: false },
    { user_id: userId, name: "Auto Loan Payment", amount: 485.00, date: daysAgo(65), category: "Auto Payment", merchant_name: "Capital One Auto", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "financing", needs_review: false },

    // Shopping
    { user_id: userId, name: "Amazon", amount: 67.99, date: daysAgo(2), category: "Shopping", merchant_name: "Amazon", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Target", amount: 124.56, date: daysAgo(10), category: "Shopping", merchant_name: "Target", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Nike.com", amount: 159.00, date: daysAgo(18), category: "Shopping", merchant_name: "Nike", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Amazon", amount: 34.99, date: daysAgo(26), category: "Shopping", merchant_name: "Amazon", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Nordstrom", amount: 215.00, date: daysAgo(38), category: "Shopping", merchant_name: "Nordstrom", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Amazon", amount: 89.47, date: daysAgo(52), category: "Shopping", merchant_name: "Amazon", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },

    // Entertainment & Subscriptions
    { user_id: userId, name: "Netflix", amount: 15.99, date: daysAgo(8), category: "Entertainment", merchant_name: "Netflix", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Netflix", amount: 15.99, date: daysAgo(38), category: "Entertainment", merchant_name: "Netflix", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Spotify", amount: 10.99, date: daysAgo(12), category: "Entertainment", merchant_name: "Spotify", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Spotify", amount: 10.99, date: daysAgo(42), category: "Entertainment", merchant_name: "Spotify", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Equinox Membership", amount: 220.00, date: daysAgo(4), category: "Health & Fitness", merchant_name: "Equinox", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Equinox Membership", amount: 220.00, date: daysAgo(34), category: "Health & Fitness", merchant_name: "Equinox", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Apple iCloud+", amount: 2.99, date: daysAgo(15), category: "Entertainment", merchant_name: "Apple", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "ChatGPT Plus", amount: 20.00, date: daysAgo(10), category: "Entertainment", merchant_name: "OpenAI", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },

    // Travel
    { user_id: userId, name: "United Airlines", amount: 389.00, date: daysAgo(25), category: "Travel", merchant_name: "United Airlines", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Marriott Hotel", amount: 276.00, date: daysAgo(23), category: "Travel", merchant_name: "Marriott", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Delta Airlines", amount: 425.00, date: daysAgo(58), category: "Travel", merchant_name: "Delta Airlines", account_id: accounts[2].id, account_name: "Chase Sapphire Reserve", cash_flow_type: "operating", needs_review: false },

    // Health
    { user_id: userId, name: "CVS Pharmacy", amount: 34.50, date: daysAgo(7), category: "Health", merchant_name: "CVS", account_id: accounts[3].id, account_name: "Amex Gold", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Dr. Smith Copay", amount: 40.00, date: daysAgo(19), category: "Health", merchant_name: "Dr. Smith", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },

    // Insurance
    { user_id: userId, name: "Auto Insurance", amount: 148.00, date: daysAgo(13), category: "Insurance", merchant_name: "Geico", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Auto Insurance", amount: 148.00, date: daysAgo(43), category: "Insurance", merchant_name: "Geico", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Renters Insurance", amount: 32.00, date: daysAgo(20), category: "Insurance", merchant_name: "Lemonade", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: "operating", needs_review: false },

    // Joint
    { user_id: userId, name: "Costco Joint Grocery", amount: 187.45, date: daysAgo(5), category: "Groceries", merchant_name: "Costco", account_id: accounts[5].id, account_name: "Joint Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Home Depot", amount: 89.99, date: daysAgo(16), category: "Home", merchant_name: "Home Depot", account_id: accounts[5].id, account_name: "Joint Checking", cash_flow_type: "operating", needs_review: false },
    { user_id: userId, name: "Costco Joint Grocery", amount: 165.30, date: daysAgo(33), category: "Groceries", merchant_name: "Costco", account_id: accounts[5].id, account_name: "Joint Checking", cash_flow_type: "operating", needs_review: false },

    // Transfers
    { user_id: userId, name: "Transfer to Savings", amount: 1000.00, date: daysAgo(1), category: "Transfer", merchant_name: null, account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: null, needs_review: false },
    { user_id: userId, name: "Transfer to Savings", amount: 1000.00, date: daysAgo(31), category: "Transfer", merchant_name: null, account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: null, needs_review: false },

    // Credit card payments
    { user_id: userId, name: "Chase Sapphire Payment", amount: 2500.00, date: daysAgo(10), category: "Payment", merchant_name: "Chase", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: null, needs_review: false },
    { user_id: userId, name: "Amex Gold Payment", amount: 1100.00, date: daysAgo(15), category: "Payment", merchant_name: "American Express", account_id: accounts[0].id, account_name: "Chase Checking", cash_flow_type: null, needs_review: false },
  ];

  for (let i = 0; i < txns.length; i += 20) {
    const { error } = await supabase.from("transactions").insert(txns.slice(i, i + 20));
    if (error) console.error("txn batch insert error:", error);
  }

  // ── Budgets ──
  await supabase.from("budgets").insert([
    { user_id: userId, category: "Groceries", monthly_limit: 600, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Food & Drink", monthly_limit: 400, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Shopping", monthly_limit: 300, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Entertainment", monthly_limit: 100, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Transportation", monthly_limit: 250, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Utilities", monthly_limit: 350, period: "monthly", budget_scope: "personal" },
    { user_id: userId, category: "Health & Fitness", monthly_limit: 250, period: "monthly", budget_scope: "personal" },
  ]);

  // ── Financial Goals ──
  await supabase.from("financial_goals").insert([
    { user_id: userId, name: "Emergency Fund", target_amount: 50000, current_amount: 32150, category: "savings", color: "#22c55e", icon: "shield", is_active: true, deadline: daysFromNow(365) },
    { user_id: userId, name: "Down Payment", target_amount: 100000, current_amount: 32150, category: "savings", color: "#3b82f6", icon: "home", is_active: true, deadline: daysFromNow(730), linked_account_id: accounts[1].id },
    { user_id: userId, name: "Vacation Fund", target_amount: 5000, current_amount: 2800, category: "travel", color: "#f59e0b", icon: "plane", is_active: true, deadline: daysFromNow(180) },
    { user_id: userId, name: "Pay Off Auto Loan", target_amount: 18750, current_amount: 6250, category: "debt", color: "#ef4444", icon: "car", is_active: true, deadline: daysFromNow(1095) },
  ]);

  // ── Assets ──
  await supabase.from("assets").insert([
    { user_id: userId, name: "2022 Tesla Model 3", type: "vehicle", value: 28000, is_liability: false },
    { user_id: userId, name: "Jewelry & Watches", type: "other", value: 5500, is_liability: false },
    { user_id: userId, name: "Student Loan", type: "other", value: 12400, is_liability: true },
  ]);

  // ── Recurring Transactions ──
  await supabase.from("recurring_transactions").insert([
    { user_id: userId, name: "Rent", expected_amount: 2200, frequency: "monthly", category: "Rent", merchant_name: "Landlord LLC", is_active: true, next_expected_date: daysFromNow(28) },
    { user_id: userId, name: "Netflix", expected_amount: 15.99, frequency: "monthly", category: "Entertainment", merchant_name: "Netflix", is_active: true, next_expected_date: daysFromNow(22) },
    { user_id: userId, name: "Spotify", expected_amount: 10.99, frequency: "monthly", category: "Entertainment", merchant_name: "Spotify", is_active: true, next_expected_date: daysFromNow(18) },
    { user_id: userId, name: "Equinox", expected_amount: 220, frequency: "monthly", category: "Health & Fitness", merchant_name: "Equinox", is_active: true, next_expected_date: daysFromNow(26) },
    { user_id: userId, name: "Auto Insurance", expected_amount: 148, frequency: "monthly", category: "Insurance", merchant_name: "Geico", is_active: true, next_expected_date: daysFromNow(17) },
    { user_id: userId, name: "Auto Loan", expected_amount: 485, frequency: "monthly", category: "Auto Payment", merchant_name: "Capital One Auto", is_active: true, next_expected_date: daysFromNow(25) },
    { user_id: userId, name: "Internet", expected_amount: 79.99, frequency: "monthly", category: "Utilities", merchant_name: "Spectrum", is_active: true, next_expected_date: daysFromNow(23) },
    { user_id: userId, name: "ChatGPT Plus", expected_amount: 20.00, frequency: "monthly", category: "Entertainment", merchant_name: "OpenAI", is_active: true, next_expected_date: daysFromNow(20) },
  ]);

  // ── Credit Cards ──
  await supabase.from("credit_cards").insert([
    { user_id: userId, card_name: "Chase Sapphire Reserve", card_issuer: "Chase", account_id: accounts[2].id, annual_fee: 550, statement_close_day: 15, payment_due_day: 10 },
    { user_id: userId, card_name: "Amex Gold", card_issuer: "American Express", account_id: accounts[3].id, annual_fee: 250, statement_close_day: 20, payment_due_day: 15 },
  ]);

  // ── Digital Subscriptions ──
  await supabase.from("digital_subscriptions").insert([
    { user_id: userId, name: "Netflix", category: "Entertainment", cost: 15.99, billing_cycle: "monthly", is_active: true, next_billing_date: daysFromNow(22) },
    { user_id: userId, name: "Spotify Premium", category: "Entertainment", cost: 10.99, billing_cycle: "monthly", is_active: true, next_billing_date: daysFromNow(18) },
    { user_id: userId, name: "iCloud+ 200GB", category: "Cloud Storage", cost: 2.99, billing_cycle: "monthly", is_active: true, next_billing_date: daysFromNow(15) },
    { user_id: userId, name: "ChatGPT Plus", category: "Productivity", cost: 20.00, billing_cycle: "monthly", is_active: true, next_billing_date: daysFromNow(10) },
    { user_id: userId, name: "Adobe Creative Cloud", category: "Productivity", cost: 54.99, billing_cycle: "monthly", is_active: true, next_billing_date: daysFromNow(8) },
    { user_id: userId, name: "1Password", category: "Security", cost: 35.88, billing_cycle: "annual", is_active: true, next_billing_date: daysFromNow(120) },
  ]);

  // ── Investment Holdings ──
  await supabase.from("investment_holdings").insert([
    { user_id: userId, name: "Vanguard S&P 500 ETF", ticker: "VOO", asset_class: "US Equities", quantity: 45, cost_basis: 16200, current_value: 21150, account_id: accounts[4].id },
    { user_id: userId, name: "Vanguard Total Bond ETF", ticker: "BND", asset_class: "Bonds", quantity: 100, cost_basis: 7800, current_value: 7500, account_id: accounts[4].id },
    { user_id: userId, name: "Vanguard International", ticker: "VXUS", asset_class: "International Equities", quantity: 120, cost_basis: 6000, current_value: 6840, account_id: accounts[4].id },
    { user_id: userId, name: "Apple Inc", ticker: "AAPL", asset_class: "US Equities", quantity: 50, cost_basis: 7500, current_value: 10750 },
    { user_id: userId, name: "Bitcoin", ticker: "BTC", asset_class: "Crypto", quantity: 0.25, cost_basis: 8000, current_value: 15250 },
  ]);

  // ── Balance Sheet Snapshots ──
  await supabase.from("balance_sheet_snapshots").insert([
    { user_id: userId, snapshot_date: monthsAgo(6), total_assets: 135000, total_liabilities: 38000, total_equity: 97000, current_assets: 38000, fixed_assets: 97000, current_liabilities: 5000, long_term_liabilities: 33000 },
    { user_id: userId, snapshot_date: monthsAgo(5), total_assets: 138500, total_liabilities: 37200, total_equity: 101300, current_assets: 39500, fixed_assets: 99000, current_liabilities: 4800, long_term_liabilities: 32400 },
    { user_id: userId, snapshot_date: monthsAgo(4), total_assets: 141000, total_liabilities: 36500, total_equity: 104500, current_assets: 40000, fixed_assets: 101000, current_liabilities: 4500, long_term_liabilities: 32000 },
    { user_id: userId, snapshot_date: monthsAgo(3), total_assets: 145200, total_liabilities: 35800, total_equity: 109400, current_assets: 41200, fixed_assets: 104000, current_liabilities: 4200, long_term_liabilities: 31600 },
    { user_id: userId, snapshot_date: monthsAgo(2), total_assets: 148800, total_liabilities: 35100, total_equity: 113700, current_assets: 42300, fixed_assets: 106500, current_liabilities: 3900, long_term_liabilities: 31200 },
    { user_id: userId, snapshot_date: monthsAgo(1), total_assets: 152000, total_liabilities: 34500, total_equity: 117500, current_assets: 43500, fixed_assets: 108500, current_liabilities: 3700, long_term_liabilities: 30800 },
  ]);

  // ── CEO Tasks ──
  await supabase.from("ceo_tasks").insert([
    { user_id: userId, title: "Review Q1 investment performance", priority: "high", status: "todo", due_date: daysFromNow(7) },
    { user_id: userId, title: "Update auto insurance policy", priority: "medium", status: "todo", due_date: daysFromNow(14) },
    { user_id: userId, title: "Rebalance 401k allocation", priority: "high", status: "in_progress", due_date: daysFromNow(5) },
    { user_id: userId, title: "File quarterly estimated taxes", priority: "high", status: "todo", due_date: daysFromNow(30) },
    { user_id: userId, title: "Cancel unused Adobe subscription", priority: "low", status: "todo", due_date: daysFromNow(3) },
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const demoUser = existingUsers?.users?.find((u) => u.email === DEMO_EMAIL);

    let userId: string;

    if (!demoUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Demo User" },
      });
      if (error) throw error;
      userId = data.user.id;
    } else {
      userId = demoUser.id;
    }

    await seedDemoData(supabaseAdmin, userId);

    return new Response(
      JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Demo user error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

