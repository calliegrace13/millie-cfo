// App configuration - edit these values to customize your app
export const APP_NAME = "Millie CEO";
export const APP_TAGLINE = "Run Your Life Like a Business";

export type MillieRole = 'cfo' | 'coo' | 'ceo' | 'chro' | 'cto' | 'cio' | 'cmo';

// Roles hidden from production UI (role switcher + routes). Remove entries to re-enable.
export const HIDDEN_ROLES: Set<MillieRole> = new Set(['coo', 'chro', 'cto', 'cio', 'cmo']);

export const MILLIE_ROLES: { id: MillieRole; label: string; tagline: string; icon: string }[] = [
  { id: 'ceo', label: 'CEO', tagline: 'Strategy', icon: 'Target' },
  { id: 'cfo', label: 'CFO', tagline: 'Finances', icon: 'DollarSign' },
  { id: 'coo', label: 'COO', tagline: 'Operations', icon: 'ChefHat' },
  { id: 'cto', label: 'CTO', tagline: 'Technology', icon: 'Monitor' },
  { id: 'cio', label: 'CIO', tagline: 'Investments', icon: 'LineChart' },
  { id: 'cmo', label: 'CMO', tagline: 'Marketing', icon: 'Megaphone' },
  { id: 'chro', label: 'CHRO', tagline: 'People', icon: 'Users' },
];

export const VISIBLE_ROLES = MILLIE_ROLES.filter(r => !HIDDEN_ROLES.has(r.id));
