// =============================================
// CLIENTE SUPABASE — PAINEL PRINCIPAL
// Lê as credenciais de config.js (window.APP_CONFIG).
// IMPORTANTE: config.js deve ser carregado ANTES deste script.
// =============================================

if (!window.APP_CONFIG || !window.APP_CONFIG.SUPABASE_URL) {
  console.error('[supabase.js] APP_CONFIG não encontrado. Carregue config.js antes de supabase.js.')
}

const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL
const SUPABASE_KEY = window.APP_CONFIG?.SUPABASE_KEY

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.db = db

console.log('%c⚡ Supabase: PAINEL PRINCIPAL', 'color: green; font-weight: bold;')
