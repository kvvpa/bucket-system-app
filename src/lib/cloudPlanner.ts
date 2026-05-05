import { supabase } from './supabase';

const TABLE_NAME = 'planner_states';

export type CloudPlannerRow = {
  user_id: string;
  planner_state: unknown;
  updated_at: string;
};

export async function sendMagicLink(email: string, redirectTo: string) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) throw error;
}

export async function signOutLocal() {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuth(
  callback: (event: string, session: Awaited<ReturnType<typeof getCurrentSession>>) => void
) {
  if (!supabase) return { unsubscribe() {} };

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return data.subscription;
}

export async function loadCloudPlanner(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('planner_state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveCloudPlanner(userId: string, plannerState: unknown) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const payload = {
    user_id: userId,
    planner_state: plannerState,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: 'user_id' })
    .select('updated_at')
    .single();

  if (error) throw error;
  return data;
}
