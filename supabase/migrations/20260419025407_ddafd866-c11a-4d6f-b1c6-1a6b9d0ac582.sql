
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  category text DEFAULT '',
  expiry_1 date,
  expiry_2 date,
  expiry_3 date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_name ON public.products(name);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Public delete products" ON public.products FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_products_updated
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Alerts: one per (product, batch_index, expiry_date)
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_index smallint NOT NULL CHECK (batch_index IN (1,2,3)),
  expiry_date date NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','expired')),
  first_shown_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, batch_index, expiry_date)
);

CREATE INDEX idx_alerts_dismissed ON public.alerts(dismissed_at);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read alerts" ON public.alerts FOR SELECT USING (true);
CREATE POLICY "Public insert alerts" ON public.alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update alerts" ON public.alerts FOR UPDATE USING (true);
CREATE POLICY "Public delete alerts" ON public.alerts FOR DELETE USING (true);
