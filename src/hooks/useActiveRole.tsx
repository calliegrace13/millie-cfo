import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { MillieRole } from '@/lib/constants';

type ActiveRoleContextType = {
  activeRole: MillieRole;
  setActiveRole: (role: MillieRole) => void;
};

const ActiveRoleContext = createContext<ActiveRoleContextType | undefined>(undefined);

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRole] = useState<MillieRole>('cfo');

  useEffect(() => {
    document.documentElement.setAttribute('data-role', activeRole);
  }, [activeRole]);

  return (
    <ActiveRoleContext.Provider value={{ activeRole, setActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole() {
  const context = useContext(ActiveRoleContext);
  if (!context) throw new Error('useActiveRole must be used within ActiveRoleProvider');
  return context;
}
