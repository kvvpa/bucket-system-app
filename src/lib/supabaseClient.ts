import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://gejnvrnujwvjxnjxnlrn.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_koQ7RBuTOjiQzwRKiwSSEA_fr9GhVqD";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabasePublishableKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
