import { ReactNode, useState, useEffect } from 'react';
import { NotificationBell } from './NotificationBell';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Wallet, 
  ArrowLeftRight, 
  FileText, 
  PieChart, 
  LogOut,
  Menu,
  X,
  Settings,
  DollarSign,
  ChefHat,
  Target,
  Users,
  Dumbbell,
  ChevronDown,
  Monitor,
  LineChart,
  Megaphone,
} from 'lucide-react';
import logo from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import { APP_NAME, VISIBLE_ROLES, MillieRole } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useIsDemo } from '@/hooks/useIsDemo';

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
};

const navByRole: Record<MillieRole, NavItem[]> = {
  cfo: [
    { label: 'Dashboard', href: '/cfo', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Accounts', href: '/accounts', icon: <Wallet className="w-5 h-5" /> },
    { label: 'Manage Finances', href: '/manage-finances', icon: <ArrowLeftRight className="w-5 h-5" /> },
    { label: 'Financial Statements', href: '/financial-statements', icon: <FileText className="w-5 h-5" /> },
    { label: 'Analytics', href: '/analytics', icon: <PieChart className="w-5 h-5" /> },
  ],
  coo: [
    { label: 'Dashboard', href: '/coo', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Nutrition', href: '/coo/meal-plan', icon: <ChefHat className="w-5 h-5" /> },
    { label: 'Workouts', href: '/coo/workouts', icon: <Dumbbell className="w-5 h-5" /> },
  ],
  ceo: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Calendar', href: '/ceo', icon: <Target className="w-5 h-5" /> },
    { label: 'Tasks', href: '/ceo/tasks', icon: <LayoutDashboard className="w-5 h-5" /> },
  ],
  cto: [
    { label: 'Dashboard', href: '/cto', icon: <LayoutDashboard className="w-5 h-5" /> },
  ],
  cio: [
    { label: 'Dashboard', href: '/cio', icon: <LayoutDashboard className="w-5 h-5" /> },
  ],
  cmo: [
    { label: 'Dashboard', href: '/cmo', icon: <LayoutDashboard className="w-5 h-5" /> },
  ],
  chro: [
    { label: 'Dashboard', href: '/chro', icon: <LayoutDashboard className="w-5 h-5" /> },
  ],
};

const roleIcons: Record<MillieRole, ReactNode> = {
  cfo: <DollarSign className="w-4 h-4" />,
  coo: <ChefHat className="w-4 h-4" />,
  ceo: <Target className="w-4 h-4" />,
  cto: <Monitor className="w-4 h-4" />,
  cio: <LineChart className="w-4 h-4" />,
  cmo: <Megaphone className="w-4 h-4" />,
  chro: <Users className="w-4 h-4" />,
};

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { activeRole, setActiveRole } = useActiveRole();
  const { isDemo } = useIsDemo();

  const roleDashboard: Record<MillieRole, string> = { ceo: '/', cfo: '/cfo', coo: '/coo', cto: '/cto', cio: '/cio', cmo: '/cmo', chro: '/chro' };

  const navItems = [...navByRole[activeRole], { label: 'Settings', href: '/settings', icon: <Settings className="w-5 h-5" /> }];

  return (
    <div className="min-h-screen bg-background">
      {/* Demo banner */}
      {isDemo && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-black text-center text-sm font-medium py-1.5 px-4">
          🔒 Demo Mode — View only. <Link to="/auth" className="underline font-bold" onClick={() => signOut()}>Sign up</Link> to create your own account.
        </div>
      )}
      {/* Mobile header */}
      <header className={cn(
        "lg:hidden fixed left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-4",
        isDemo ? "top-8" : "top-0"
      )}>
        <div className="flex items-center gap-2">
          <img src={logo} alt={APP_NAME} className="h-14 w-auto mix-blend-multiply dark:mix-blend-screen dark:brightness-110" />
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 h-full w-64 bg-card border-r border-border z-40 transform transition-transform duration-300 lg:translate-x-0 flex flex-col",
        isDemo ? "top-8" : "top-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-border hidden lg:block">
          <div className="flex items-center justify-between mb-3">
            <img src={logo} alt={APP_NAME} className="h-20 w-auto mix-blend-multiply dark:mix-blend-screen dark:brightness-110" />
            <NotificationBell />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm font-medium transition-colors">
                <div className="flex items-center gap-2">
                  {roleIcons[activeRole]}
                  <span>{VISIBLE_ROLES.find(r => r.id === activeRole)?.label || 'CEO'}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[calc(var(--radix-dropdown-menu-trigger-width))] bg-popover z-50">
              {VISIBLE_ROLES.map((role) => (
                <DropdownMenuItem
                  key={role.id}
                  onClick={() => { setActiveRole(role.id); navigate(roleDashboard[role.id]); }}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    activeRole === role.id && "bg-black text-white focus:bg-black focus:text-white"
                  )}
                >
                  {roleIcons[role.id]}
                  <span>{role.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile role switcher */}
        <div className="px-4 pt-4 pb-2 mt-16 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm font-medium transition-colors">
                <div className="flex items-center gap-2">
                  {roleIcons[activeRole]}
                  <span>{VISIBLE_ROLES.find(r => r.id === activeRole)?.label || 'CEO'}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[calc(var(--radix-dropdown-menu-trigger-width))] bg-popover z-50">
              {VISIBLE_ROLES.map((role) => (
                <DropdownMenuItem
                  key={role.id}
                  onClick={() => { setActiveRole(role.id); navigate(roleDashboard[role.id]); setSidebarOpen(false); }}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    activeRole === role.id && "bg-black text-white focus:bg-black focus:text-white"
                  )}
                >
                  {roleIcons[role.id]}
                  <span>{role.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
                    ? "bg-black text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <span className="text-sm font-medium">{user?.email?.[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="w-5 h-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-foreground/20 z-30 lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Main content */}
      <main className={cn("lg:ml-64 min-h-screen", isDemo ? "pt-24 lg:pt-8" : "pt-16 lg:pt-0")}>
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
