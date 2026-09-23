export type ModuleId = 'menu' | 'agenda' | 'catalog' | 'loyalty' | 'moving';

export interface Tenant {
  id: string; slug: string; name: string; niche: string;
  currency: string; currency_decimals: number; locale: string; timezone: string; country: string;
  whatsapp: string | null; address: string | null; accent: string;
  modules: Record<ModuleId, boolean>; settings: Record<string, unknown>; is_published: boolean;
}
export interface Category { id: string; module: 'menu' | 'catalog'; name: string; position: number }
export interface Item {
  id: string; module: 'menu' | 'catalog'; category_id: string | null; name: string; description: string;
  price_minor: number; promo_minor: number | null; stock: number | null; emoji: string | null; image_path: string | null; active: boolean; position: number;
}
export interface Service { id: string; name: string; description: string; duration_min: number; price_minor: number; active: boolean }
export interface LoyaltyProgram { mode: 'stamps' | 'points'; goal: number; reward: string; points_per_unit: number; min_purchase_minor: number }
export interface NichePreset { niche: string; label: Record<string, string>; modules: Record<ModuleId, boolean> }
export interface Membership { role: 'owner' | 'admin' | 'staff'; tenants: Tenant }

export const MODULE_IDS: ModuleId[] = ['menu', 'agenda', 'catalog', 'loyalty', 'moving'];

export interface OrderRow {
  id: string; number: number; module: 'menu' | 'catalog'; status: string; fulfillment: 'pickup' | 'delivery' | 'dine_in';
  customer_name: string; customer_phone: string; address: string | null; table_label: string | null;
  payment_method: string; cash_change_minor: number | null; note: string | null;
  subtotal_minor: number; fee_minor: number; total_minor: number; currency: string; created_at: string;
}
export interface OrderItemRow { id: string; order_id: string; name: string; unit_minor: number; qty: number; note: string | null }
export interface TrackData {
  number: number; module: 'menu' | 'catalog'; status: string; fulfillment: string; payment_method: string;
  subtotal_minor: number; fee_minor: number; total_minor: number; currency: string; created_at: string; updated_at: string;
  tenant_slug: string; items: { name: string; qty: number; unit_minor: number }[];
}
