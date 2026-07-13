const { createClient } = require('@supabase/supabase-js')

let _supabase = null
function getSupabase() {
  if (!_supabase) {
    if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL não definida')
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  }
  return _supabase
}

/**
 * Insere um visitante registrado pelo bot no Supabase.
 * Usa upsert por telefone para evitar duplicatas.
 */
async function salvarVisitante({ nome, telefone, email, dataNascimento, bairro, comoConheceu, receberProgramacoes }) {
  // Limpa o JID para obter só o número
  const telefoneClean = telefone.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
  const telNorm = telefoneClean.replace(/\D/g, '')

  const db = getSupabase()

  // Verifica se já existe pelo telefone
  const { data: existente } = await db
    .from('visitantes')
    .select('id')
    .filter('telefone', 'ilike', `%${telNorm.slice(-8)}%`)
    .limit(1)
    .maybeSingle()

  const payload = {
    nome,
    telefone: telefoneClean,
    email: email || null,
    data_nascimento: dataNascimento || null,
    bairro: bairro || null,
    como_conheceu: comoConheceu || null,
    receber_programacoes: receberProgramacoes,
    data_visita: new Date().toISOString().split('T')[0],
    origem: 'bot_whatsapp',
  }

  if (existente) {
    const { error } = await db
      .from('visitantes')
      .update(payload)
      .eq('id', existente.id)
    if (error) throw error
    return existente.id
  }

  const { data, error } = await db
    .from('visitantes')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

module.exports = { salvarVisitante }
