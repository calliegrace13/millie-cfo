import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useCallback } from 'react';

const DEMO_EMAIL = 'demo@millieceo.app';

export function useIsDemo() {
  const { user } = useAuth();
  const isDemo = user?.email === DEMO_EMAIL;

  const guardAction = useCallback(
    <T extends (...args: any[]) => any>(action: T): T => {
      if (!isDemo) return action;
      return ((...args: any[]) => {
        toast.error('Demo account is read-only. Sign up for a free account to make changes.');
      }) as unknown as T;
    },
    [isDemo]
  );

  /** Wraps a form submit handler — prevents default and shows toast in demo mode */
  const guardSubmit = useCallback(
    (handler: (e: React.FormEvent) => void) => (e: React.FormEvent) => {
      e.preventDefault();
      if (isDemo) {
        toast.error('Demo account is read-only. Sign up for a free account to make changes.');
        return;
      }
      handler(e);
    },
    [isDemo]
  );

  return { isDemo, guardAction, guardSubmit };
}
