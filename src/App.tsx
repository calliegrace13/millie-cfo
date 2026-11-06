import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SettingsProvider } from "@/hooks/useSettings";
import { ActiveRoleProvider } from "@/hooks/useActiveRole";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Accounts from "./pages/Accounts";
import ManageFinances from "./pages/ManageFinances";
import FinancialStatements from "./pages/FinancialStatements";
import Analytics from "./pages/Analytics";
import COODashboard from "./pages/COODashboard";
import CEODashboard from "./pages/CEODashboard";
import CHRODashboard from "./pages/CHRODashboard";
import CTODashboard from "./pages/CTODashboard";
import CIODashboard from "./pages/CIODashboard";
import CMODashboard from "./pages/CMODashboard";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <ActiveRoleProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<P><CEODashboard /></P>} />
                  <Route path="/accounts" element={<P><Accounts /></P>} />
                  <Route path="/manage-finances" element={<P><ManageFinances /></P>} />
                  <Route path="/analytics" element={<P><Analytics /></P>} />
                  <Route path="/financial-statements" element={<P><FinancialStatements /></P>} />
                  {/* Hidden roles routes removed — uncomment when ready for production */}
                  {/* <Route path="/coo" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/meal-plan" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/recipes" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/groceries" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/nutrition" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/workouts" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/workout-stats" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/health" element={<P><COODashboard /></P>} /> */}
                  {/* <Route path="/coo/health-dashboard" element={<P><COODashboard /></P>} /> */}
                  <Route path="/ceo" element={<P><CEODashboard /></P>} />
                  <Route path="/ceo/tasks" element={<P><CEODashboard /></P>} />
                  <Route path="/cfo" element={<P><Dashboard /></P>} />
                  {/* <Route path="/cto" element={<P><CTODashboard /></P>} /> */}
                  {/* <Route path="/cio" element={<P><CIODashboard /></P>} /> */}
                  {/* <Route path="/cmo" element={<P><CMODashboard /></P>} /> */}
                  {/* <Route path="/chro" element={<P><CHRODashboard /></P>} /> */}
                  <Route path="/settings" element={<P><Settings /></P>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </ActiveRoleProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
