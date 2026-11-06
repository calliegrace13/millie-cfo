import { useCallback, useState } from 'react';
import { usePlaidLink as usePlaidLinkLib, PlaidLinkOptions, PlaidLinkOnSuccess } from 'react-plaid-link';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError } from '@/lib/logging';
import { useIsDemo } from '@/hooks/useIsDemo';

export function usePlaidLink(onSuccess?: () => void) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isDemo } = useIsDemo();

  const ensureFreshSession = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session) throw new Error('Not authenticated');

    // Proactively refresh when close to expiry to avoid "Invalid JWT" on function calls.
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    const refreshThresholdMs = 60_000;

    if (expiresAtMs && Date.now() > expiresAtMs - refreshThresholdMs) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      if (!data.session) throw new Error('Session refresh failed');
    }
  }, []);

  const invokeWithFreshAuth = useCallback(
    async <T,>(functionName: string, options?: Parameters<typeof supabase.functions.invoke>[1]) => {
      await ensureFreshSession();

      let result = await supabase.functions.invoke<T>(functionName, options);

      // If the gateway rejected the JWT (often due to expiry), refresh once and retry.
      const status = (result.error as any)?.context?.status;
      if (result.error && status === 401) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          result = await supabase.functions.invoke<T>(functionName, options);
        }
      }

      return result;
    },
    [ensureFreshSession]
  );

  const createLinkToken = useCallback(async () => {
    if (isDemo) {
      toast.error('Demo account cannot connect bank accounts. Sign up for a free account.');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await invokeWithFreshAuth<{ link_token: string; error?: string }>(
        'plaid-create-link-token'
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setLinkToken(data.link_token);
      return data.link_token;
    } catch (err) {
      logError('Plaid link token', err);
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message === 'Not authenticated' ? 'Please sign in to connect a bank.' : 'Failed to connect to Plaid');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [invokeWithFreshAuth]);

  const handleOnSuccess: PlaidLinkOnSuccess = useCallback(
    async (public_token, metadata) => {
      try {
        const { data, error } = await invokeWithFreshAuth<{ error?: string }>('plaid-exchange-token', {
          body: { public_token, metadata },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success('Bank account connected successfully!');
        onSuccess?.();
      } catch (err) {
        logError('Plaid exchange token', err);
        toast.error('Failed to link bank account');
      }
    },
    [onSuccess, invokeWithFreshAuth]
  );

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleOnSuccess,
    onExit: (err) => {
      if (err) {
        logError('Plaid Link exit', err);
      }
    },
  };

  const { open, ready } = usePlaidLinkLib(config);

  const openPlaidLink = useCallback(async () => {
    if (!linkToken) {
      const token = await createLinkToken();
      if (token) {
        // Token will be set, user needs to click again
        toast.info('Ready to connect. Click the button again to open Plaid.');
      }
    } else if (ready) {
      open();
    }
  }, [linkToken, ready, open, createLinkToken]);

  return {
    openPlaidLink,
    isLoading,
    ready: ready && !!linkToken,
    createLinkToken,
  };
}
