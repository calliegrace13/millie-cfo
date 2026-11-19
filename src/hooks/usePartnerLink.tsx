import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type PartnerLink = {
  id: string;
  user_id: string;
  partner_user_id: string | null;
  pairing_code: string;
  status: string;
  created_at: string;
  expires_at?: string | null;
  linked_at: string | null;
};

export function usePartnerLink() {
  const { user } = useAuth();
  const [partnerLink, setPartnerLink] = useState<PartnerLink | null>(null);
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLink = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from('partner_links')
      .select('*')
      .or(`user_id.eq.${user.id},partner_user_id.eq.${user.id}`)
      .in('status', ['active','pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setPartnerLink(data as PartnerLink);

      // Fetch partner email from profiles
      if (data.status === 'active') {
        const partnerId = data.user_id === user.id ? data.partner_user_id : data.user_id;
        if (partnerId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', partnerId)
            .single();
          setPartnerEmail(profile?.email || null);
          setPartnerName(profile?.full_name || null);
        }
      }
    } else {
      setPartnerLink(null);
      setPartnerEmail(null);
      setPartnerName(null);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLink(); const onFocus=()=>{void fetchLink();}; window.addEventListener('focus',onFocus); return ()=>window.removeEventListener('focus',onFocus); }, [fetchLink]);

  const generateCode = async () => {
    if (!user) return null;
    const { data, error } = await (supabase as any).rpc('finance_invite');
    if (error) throw error;
    setPartnerLink(data as PartnerLink);
    return data.pairing_code;
  };

  const redeemCode = async (code: string) => {
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase.rpc('redeem_partner_code', { _code: code });

    if (error) throw error;
    const result = data as Record<string, unknown> | null;
    if (result?.error) throw new Error(String(result.error));
    await fetchLink();
  };

  const unlinkPartner = async () => {
    if (!partnerLink) return;
    const {error} = await (supabase as any).rpc('finance_unlink');
    if(error) throw error;
    setPartnerLink(null);
    setPartnerEmail(null);
    setPartnerName(null);
  };

  return { partnerLink, partnerEmail, partnerName, loading, generateCode, redeemCode, unlinkPartner, refetch: fetchLink };
}

