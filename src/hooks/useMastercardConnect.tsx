import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

declare global {
  interface Window {
    Connect?: {
      launch: (
        url: string,
        handlers: {
          onDone?: (event: { code: string; reason?: string }) => void;
          onCancel?: (event: { code: string; reason?: string }) => void;
          onError?: (event: { code: string; reason?: string }) => void;
          onRoute?: (event: { screen: string }) => void;
          onUser?: (event: unknown) => void;
          onLoad?: () => void;
        },
        options?: {
          popup?: boolean;
          popupOptions?: {
            width?: number;
            height?: number;
            top?: number;
            left?: number;
          };
          overlay?: string;
        }
      ) => void;
      destroy: () => void;
    };
  }
}

export function useMastercardConnect(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const loadConnectSDK = useCallback(async () => {
    if (window.Connect) return;
    
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://connect2.finicity.com/assets/sdk/finicity-connect.min.js';
      script.async = true;
      script.onload = () => {
        // Wait for Connect to be available on window
        const checkConnect = () => {
          if (window.Connect) {
            resolve();
          } else {
            setTimeout(checkConnect, 100);
          }
        };
        setTimeout(checkConnect, 100);
      };
      script.onerror = () => reject(new Error('Failed to load Mastercard Connect SDK'));
      document.body.appendChild(script);
    });
  }, []);

  const openMastercardConnect = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Step 1: Create or get customer
      const { data: customerData, error: customerError } = await supabase.functions.invoke(
        'mastercard-create-customer'
      );
      
      if (customerError || customerData?.error) {
        throw new Error(customerData?.error || customerError?.message || 'Failed to create customer');
      }

      const { customerId: newCustomerId, accessToken } = customerData;
      setCustomerId(newCustomerId);

      // Step 2: Generate Connect URL
      const { data: urlData, error: urlError } = await supabase.functions.invoke(
        'mastercard-generate-connect-url',
        { body: { customerId: newCustomerId, accessToken } }
      );

      if (urlError || urlData?.error) {
        throw new Error(urlData?.error || urlError?.message || 'Failed to generate Connect URL');
      }

      const { connectUrl } = urlData;

      // Step 3: Load SDK and launch Connect
      await loadConnectSDK();

      if (!window.Connect) {
        throw new Error('Connect SDK not loaded');
      }

      // Launch returns immediately - stop loading spinner
      setIsLoading(false);

      window.Connect.launch(connectUrl, {
        onDone: async (event) => {
          console.log('Mastercard Connect done:', event);
          
          // Fetch accounts after successful connection
          try {
            const { data, error } = await supabase.functions.invoke(
              'mastercard-get-accounts',
              { body: { customerId: newCustomerId } }
            );
            
            if (error || data?.error) {
              console.error('Error fetching accounts:', data?.error || error);
            } else {
              toast.success(`Connected ${data.accountCount} account(s)`);
            }
          } catch (err) {
            console.error('Error fetching accounts:', err);
          }
          
          onSuccess?.();
        },
        onCancel: (event) => {
          console.log('Mastercard Connect cancelled:', event);
          toast.info('Connection cancelled');
        },
        onError: (event) => {
          console.error('Mastercard Connect error:', event);
          toast.error('Connection failed: ' + (event.reason || 'Unknown error'));
        },
        onLoad: () => {
          console.log('Mastercard Connect loaded');
        },
      }, {
        popup: true,
        popupOptions: {
          width: 600,
          height: 700,
          top: (window.outerHeight / 2) + window.screenY - 350,
          left: (window.outerWidth / 2) + window.screenX - 300,
        },
      });
    } catch (error) {
      console.error('Mastercard Connect error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open Mastercard Connect');
      setIsLoading(false);
    }
  }, [loadConnectSDK, onSuccess]);

  return {
    openMastercardConnect,
    isLoading,
    customerId,
  };
}
