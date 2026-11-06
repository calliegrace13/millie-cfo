import { supabase } from '@/integrations/supabase/client';
import type { Transaction } from '@/lib/types';

export interface TransactionOffset {
  parent_transaction_id: string;
  offset_transaction_id: string;
}

/**
 * Fetch all transaction_offsets for the current user.
 */
export async function fetchTransactionOffsets(): Promise<TransactionOffset[]> {
  const { data, error } = await supabase.from('transaction_offsets').select('*');
  if (error) {
    console.error('Failed to fetch transaction offsets', error);
    return [];
  }
  return data as TransactionOffset[];
}

/**
 * Given a list of transactions and offsets, returns a new list where:
 * - Offset child transactions are removed
 * - Parent transaction amounts are adjusted to include offset amounts (net)
 */
export function applyOffsets(
  transactions: Transaction[],
  offsets: TransactionOffset[]
): Transaction[] {
  if (offsets.length === 0) return transactions;

  const childIds = new Set(offsets.map(o => o.offset_transaction_id));

  // Build parent → sum of child amounts
  const txById = new Map(transactions.map(t => [t.id, t]));
  const parentAdjustments: Record<string, number> = {};

  for (const o of offsets) {
    const child = txById.get(o.offset_transaction_id);
    if (child) {
      parentAdjustments[o.parent_transaction_id] =
        (parentAdjustments[o.parent_transaction_id] || 0) + child.amount;
    }
  }

  return transactions
    .filter(t => !childIds.has(t.id))
    .map(t => {
      const adj = parentAdjustments[t.id];
      if (adj !== undefined) {
        return { ...t, amount: t.amount + adj };
      }
      return t;
    });
}
