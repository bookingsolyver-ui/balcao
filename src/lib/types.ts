export type ModuleId = 'menu' | 'agenda' | 'catalog' | 'loyalty';

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

export const MODULE_IDS: ModuleId[] = ['menu', 'agenda', 'catalog', 'loyalty'];
