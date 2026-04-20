-- Wipe existing data
DELETE FROM public.alerts;
DELETE FROM public.products;

-- Add user_id to products
ALTER TABLE public.products
  ADD COLUMN user_id uuid NOT NULL;

-- Add user_id to alerts
ALTER TABLE public.alerts
  ADD COLUMN user_id uuid NOT NULL;

-- Drop old public policies on products
DROP POLICY IF EXISTS "Public delete products" ON public.products;
DROP POLICY IF EXISTS "Public insert products" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Public update products" ON public.products;

-- Per-user policies on products
CREATE POLICY "Users read own products" ON public.products
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own products" ON public.products
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own products" ON public.products
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Drop old public policies on alerts
DROP POLICY IF EXISTS "Public delete alerts" ON public.alerts;
DROP POLICY IF EXISTS "Public insert alerts" ON public.alerts;
DROP POLICY IF EXISTS "Public read alerts" ON public.alerts;
DROP POLICY IF EXISTS "Public update alerts" ON public.alerts;

-- Per-user policies on alerts
CREATE POLICY "Users read own alerts" ON public.alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own alerts" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON public.alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own alerts" ON public.alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Drop old global unique constraint on barcode (each user can have their own copy)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_user_barcode_key
  ON public.products (user_id, barcode);

CREATE INDEX IF NOT EXISTS products_user_id_idx ON public.products(user_id);
CREATE INDEX IF NOT EXISTS alerts_user_id_idx ON public.alerts(user_id);