import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Sem configuração o app não funciona — o README explica como preencher o .env
  console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja README.md)')
}

export const supabase = createClient(url, anonKey)
