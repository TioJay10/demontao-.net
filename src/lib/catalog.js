import { supabase } from './supabase';

export async function getActiveCatalogs() {
  if (!supabase) return { data: [], error: new Error('Supabase não configurado.') };

  return supabase
    .from('catalogs')
    .select('id, company_name, description, logo_url, cover_url, slug, primary_color, secondary_color, background_color, button_color')
    .eq('is_active', true)
    .order('company_name');
}

export async function getCatalogBySlug(slug) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado.') };

  return supabase
    .from('catalogs')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
}

export async function getCatalogProducts(catalogId) {
  if (!supabase) return { data: [], error: new Error('Supabase não configurado.') };

  return supabase
    .from('products')
    .select('id, name, description, price, stock, status, variants, category_id, product_images(id, image_url, sort_order)')
    .eq('catalog_id', catalogId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
}