
-- Clean up duplicate transactions: keep the one linked to an active account, delete others
-- Duplicates are identified by same user_id, amount, date, and merchant name but different account_id

WITH duplicate_groups AS (
  SELECT 
    t.id,
    t.user_id,
    t.amount,
    t.date,
    LOWER(COALESCE(t.merchant_name, t.name)) as merchant_key,
    t.account_id,
    COALESCE(a.is_deleted, true) as acct_is_deleted,
    t.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY t.user_id, t.amount, t.date, LOWER(COALESCE(t.merchant_name, t.name))
      ORDER BY 
        -- Prefer transactions with a non-null, non-deleted account
        CASE WHEN t.account_id IS NOT NULL AND COALESCE(a.is_deleted, false) = false THEN 0 ELSE 1 END,
        t.created_at ASC
    ) as rn
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  WHERE EXISTS (
    SELECT 1 FROM transactions t2
    LEFT JOIN accounts a2 ON t2.account_id = a2.id
    WHERE t2.user_id = t.user_id
      AND t2.amount = t.amount
      AND t2.date = t.date
      AND LOWER(COALESCE(t2.merchant_name, t2.name)) = LOWER(COALESCE(t.merchant_name, t.name))
      AND t2.id != t.id
  )
)
DELETE FROM transactions 
WHERE id IN (SELECT id FROM duplicate_groups WHERE rn > 1)

