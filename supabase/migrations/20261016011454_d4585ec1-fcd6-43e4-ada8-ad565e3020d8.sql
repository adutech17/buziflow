ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS tax_label text NOT NULL DEFAULT 'VAT',
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_footer text NOT NULL DEFAULT 'Thank you for your business!',
  ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;
UPDATE public.workspaces SET setup_completed = true;