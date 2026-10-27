// NOTE: no supplier fields here on purpose. The customer app never sees suppliers.
export type Mode = 'retail' | 'wholesale';

export type Product = {
  id: string;
  name: string;
  category?: string;
  unit: string;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  stock: number;
  image_url: string | null;
  harvested_at: string;
};

export type Promo = {
  id: string;
  title: string;
  subtitle?: string;
  kind: 'farm_box' | 'cooking_kit';
  image_url: string;
};

export type CartLine = { product: Product; qty: number };
