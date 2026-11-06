import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PartnerProfile, Account, Transaction } from '@/lib/types';

export function useOwnership() {
  const { user } = useAuth();
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPartner = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('partner_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setPartner(data as PartnerProfile | null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPartner();
  }, [fetchPartner]);

  /** Check if the joint period is active for a given date (defaults to today) */
  const isJointActive = useCallback((account: Account, dateStr?: string): boolean => {
    if (!account.is_joint) return false;
    const checkDate = dateStr || new Date().toISOString().slice(0, 10);
    if (account.joint_start_date && checkDate < account.joint_start_date) return false;
    if (account.joint_end_date && checkDate > account.joint_end_date) return false;
    return true;
  }, []);

  /** Get the effective ownership percentage for an account (0-100) */
  const getOwnershipPct = useCallback((account: Account, dateStr?: string): number => {
    if (!isJointActive(account, dateStr)) return 100;
    if (account.ownership_pct != null) return account.ownership_pct;
    if (partner) return partner.default_ownership_pct;
    return 100; // fallback
  }, [partner, isJointActive]);

  /** Scale a value by the account's ownership percentage */
  const scaleByOwnership = useCallback((value: number, account: Account, dateStr?: string): number => {
    const pct = getOwnershipPct(account, dateStr);
    return value * (pct / 100);
  }, [getOwnershipPct]);

  /** Get ownership multiplier for an account (0-1) */
  const getMultiplier = useCallback((account: Account, dateStr?: string): number => {
    return getOwnershipPct(account, dateStr) / 100;
  }, [getOwnershipPct]);

  /** Build a map of account_id -> multiplier for quick lookups */
  const buildMultiplierMap = useCallback((accounts: Account[], dateStr?: string): Record<string, number> => {
    const map: Record<string, number> = {};
    accounts.forEach(a => {
      map[a.id] = getMultiplier(a, dateStr);
    });
    return map;
  }, [getMultiplier]);

  /** Get the effective multiplier for a transaction, respecting per-tx override */
  const getTransactionMultiplier = useCallback((tx: Transaction, accounts: Account[]): number => {
    // Per-transaction override takes priority
    if (tx.ownership_pct != null) return tx.ownership_pct / 100;
    // Fall back to account-level logic
    if (!tx.account_id) return 1;
    const account = accounts.find(a => a.id === tx.account_id);
    if (!account) return 1;
    return getMultiplier(account, tx.date);
  }, [getMultiplier]);

  return {
    partner,
    loading,
    fetchPartner,
    isJointActive,
    getOwnershipPct,
    scaleByOwnership,
    getMultiplier,
    buildMultiplierMap,
    getTransactionMultiplier,
  };
}
