-- Real fill price when it differs from the planned entry; slippage is signed, positive = worse for the trader
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS actual_entry_price NUMERIC,
  ADD COLUMN IF NOT EXISTS slippage_percent   NUMERIC;
