import {lazy,Suspense} from 'react';
import {AutopilotProvider} from '@/hooks/useAutopilot';
import {ExperienceProvider} from '@/hooks/useExperience';
const WorkspaceHome=lazy(()=>import('./pages/WorkspaceHome'));
const WorkspaceTools=lazy(()=>import('./pages/WorkspaceTools'));
import {AutomationProvider} from '@/hooks/useAutomation';
const LearningPolicies=lazy(()=>import('./pages/LearningPolicies'));
const AssistantWorkspace=lazy(()=>import('./pages/AssistantWorkspace'));
import {ModulesProvider} from '@/hooks/useModules';
import {SetupProvider} from '@/hooks/useSetup';
import {SetupEntry} from '@/components/layout/SetupEntry';
import {ModuleAccess} from '@/components/layout/ModuleAccess';
const Runway = lazy(()=>import('./pages/Runway'));
const Trips = lazy(()=>import('./pages/Trips'));
const Goals = lazy(()=>import('./pages/Goals'));
const Watchlists=lazy(()=>import('./pages/FocusWorkspaces').then(m=>({default:()=> <m.default domain="watchlists"/>})));
const Recoveries=lazy(()=>import('./pages/FocusWorkspaces').then(m=>({default:()=> <m.default domain="recoveries"/>})));
const Customize = lazy(()=>import('./pages/Customize'));
const ModuleSetup=lazy(()=>import('./pages/ModuleSetup'));
const FinancialContext=lazy(()=>import('./pages/FinancialContext'));
const AnalystWorkspace=lazy(()=>import('./pages/AnalystWorkspace'));
const BudgetWorkspace = lazy(()=>import('./pages/BudgetWorkspace'));
const CloseWorkspace = lazy(()=>import('./pages/CloseWorkspace'));
const Investments = lazy(()=>import('./pages/Investments'));
const IncomeCompensation=lazy(()=>import('./pages/PlanningWorkspaces').then(m=>({default:m.IncomeCompensation})));
const InvestmentAnalysis=lazy(()=>import('./pages/PlanningWorkspaces').then(m=>({default:m.InvestmentAnalysis})));
const DebtPayoff=lazy(()=>import('./pages/PlanningWorkspaces').then(m=>({default:m.DebtPayoff})));
const LongTermPlanning=lazy(()=>import('./pages/PlanningWorkspaces').then(m=>({default:m.LongTermPlanning})));
import {ConfirmationHost} from '@/components/ui/confirm-action';
const Household = lazy(()=>import('./pages/Household'));
import HouseholdReport from './pages/AnalystReport';
import { HouseholdProvider } from './hooks/useHousehold';
const Transactions = lazy(()=>import('./pages/Transactions'));
const Budgets = lazy(()=>import('./pages/Budgets'));
const Recurring = lazy(()=>import('./pages/Recurring'));
const BalanceSheet = lazy(()=>import('./pages/AssetRegister'));
const TransactionRules = lazy(()=>import('./pages/TransactionRules'));
const Amortization = lazy(()=>import('./pages/Amortization'));
const CardBenefits = lazy(()=>import('./pages/CardBenefits'));
const EventsContent = lazy(()=>import('./pages/Events').then(m=>({default:m.EventsContent})));
import { AppLayout } from './components/layout/AppLayout';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SettingsProvider } from "@/hooks/useSettings";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";




import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
const Accounts = lazy(()=>import("./pages/Accounts"));
const Analytics = lazy(()=>import("./pages/AnalystPlanning"));
const Settings = lazy(()=>import("./pages/Settings"));
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute><SetupEntry><ModuleAccess><Suspense fallback={<div role="status" className="p-8">Opening your module...</div>}>{children}</Suspense></ModuleAccess></SetupEntry></ProtectedRoute>;

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider><SettingsProvider><ModulesProvider><AutomationProvider><ExperienceProvider><SetupProvider>
            <TooltipProvider>
              <Toaster /><ConfirmationHost/>
              <Sonner />
              <BrowserRouter><AutopilotProvider>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<P><WorkspaceHome /></P>} /><Route path="/overview" element={<P><HouseholdReport kind="overview" /></P>} /><Route path="/tools" element={<P><WorkspaceTools /></P>} />
                  <Route path="/income-statement" element={<P><HouseholdReport kind="income" /></P>} />
                  <Route path="/cash-flow" element={<P><HouseholdReport kind="cash" /></P>} />
                  <Route path="/budget-vs-actual" element={<P><HouseholdReport kind="budget" /></P>} />
                  <Route path="/cfo" element={<Navigate to="/" replace />} />
                  <Route path="/ceo/*" element={<Navigate to="/" replace />} />
                  <Route path="/transactions" element={<P><Transactions /></P>} /><Route path="/receipts" element={<P><Transactions /></P>} />
                  <Route path="/budgets" element={<P><BudgetWorkspace /></P>} />
                  <Route path="/recurring" element={<P><Recurring /></P>} />
                  <Route path="/balance-sheet" element={<P><HouseholdReport kind="balance" /></P>} />
                  <Route path="/transaction-rules" element={<P><TransactionRules /></P>} />
                  <Route path="/amortization" element={<P><Amortization /></P>} />
                  <Route path="/card-benefits" element={<P><CardBenefits /></P>} />
                  <Route path="/events" element={<P><AppLayout><EventsContent /></AppLayout></P>} />
                  <Route path="/accounts" element={<P><Accounts /></P>} />
                  <Route path="/manage-finances" element={<Navigate to="/transactions" replace />} />
                  <Route path="/analytics" element={<P><Analytics /></P>} />
                  <Route path="/analyst" element={<P><AnalystWorkspace /></P>} />
                  <Route path="/financial-statements" element={<Navigate to="/income-statement" replace />} />
                  <Route path="/household" element={<P><Household /></P>} />
                  <Route path="/advanced-income" element={<P><HouseholdReport kind="income" /></P>} />
                  <Route path="/advanced-cash" element={<P><HouseholdReport kind="cash" /></P>} />
                  <Route path="/advanced-balance" element={<P><HouseholdReport kind="balance" /></P>} /><Route path="/asset-register" element={<P><BalanceSheet /></P>} />
                  <Route path="/legacy-budgets" element={<P><Budgets /></P>} />
                  <Route path="/runway" element={<P><Runway /></P>} />
                  <Route path="/trips" element={<P><Trips /></P>} />
                  <Route path="/goals" element={<P><Goals /></P>} />
                  <Route path="/watchlists" element={<P><Watchlists/></P>}/><Route path="/money-owed" element={<P><Recoveries/></P>}/>
                  <Route path="/policies" element={<P><LearningPolicies /></P>} />
                  <Route path="/assistant" element={<P><AssistantWorkspace /></P>} />
                  <Route path="/customize" element={<P><Customize /></P>} />
                  <Route path="/setup" element={<P><ModuleSetup /></P>} />
                  <Route path="/context" element={<P><FinancialContext /></P>} />
                  <Route path="/close" element={<P><CloseWorkspace /></P>} />
                  <Route path="/investments" element={<P><Investments /></P>} />
                  <Route path="/compensation" element={<P><IncomeCompensation /></P>} />
                  <Route path="/investment-analysis" element={<P><InvestmentAnalysis /></P>} />
                  <Route path="/debt-payoff" element={<P><DebtPayoff /></P>} />
                  <Route path="/long-term" element={<P><LongTermPlanning /></P>} />
                  <Route path="/settings" element={<P><Settings /></P>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AutopilotProvider></BrowserRouter>
            </TooltipProvider>
        </SetupProvider></ExperienceProvider></AutomationProvider></ModulesProvider></SettingsProvider></HouseholdProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
