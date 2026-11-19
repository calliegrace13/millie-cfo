import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type SettingsContextType = {
  showPartnerMode: boolean;
  setShowPartnerMode: (value: boolean) => Promise<void>;
  loading: boolean;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [showPartnerMode, setShowPartnerModeState] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    supabase
      .from('profiles')
      .select('show_partner_mode')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setShowPartnerModeState((data as any).show_partner_mode ?? true);
        }
        setLoading(false);
      });
  }, [user]);

  const setShowPartnerMode = async (value: boolean) => {
    if (!user) return;
    setShowPartnerModeState(value);
    await supabase
      .from('profiles')
      .update({ show_partner_mode: value } as any)
      .eq('id', user.id);
  };

  return (
    <SettingsContext.Provider value={{ showPartnerMode, setShowPartnerMode, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

