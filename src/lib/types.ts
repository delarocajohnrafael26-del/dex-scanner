export type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
  expiry_1: string | null;
  expiry_2: string | null;
  expiry_3: string | null;
  created_at: string;
  updated_at: string;
};

export type Alert = {
  id: string;
  product_id: string;
  batch_index: 1 | 2 | 3;
  expiry_date: string;
  severity: "warning" | "expired";
  first_shown_at: string;
  last_shown_at: string;
  dismissed_at: string | null;
  created_at: string;
};
