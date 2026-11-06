import { supabase } from '@/integrations/supabase/client';
import { useIsDemo } from '@/hooks/useIsDemo';
import { useMemo } from 'react';
import { toast } from 'sonner';

/**
 * Returns the supabase client but with insert/update/delete/upsert 
 * operations blocked for demo users (shows a toast instead).
 */
export function useDemoSupabase() {
  const { isDemo } = useIsDemo();

  const client = useMemo(() => {
    if (!isDemo) return supabase;

    // Create a proxy that intercepts .from() calls
    return new Proxy(supabase, {
      get(target, prop) {
        if (prop === 'from') {
          return (...args: any[]) => {
            const builder = (target as any).from(...args);
            return new Proxy(builder, {
              get(builderTarget: any, builderProp: string) {
                if (['insert', 'update', 'delete', 'upsert'].includes(builderProp)) {
                  return () => {
                    toast.error('Demo account is read-only. Sign up for a free account to make changes.');
                    return Promise.resolve({ data: null, error: { message: 'Demo account is read-only' } });
                  };
                }
                return builderTarget[builderProp];
              }
            });
          };
        }
        return (target as any)[prop];
      }
    });
  }, [isDemo]);

  return { supabase: client, isDemo };
}
