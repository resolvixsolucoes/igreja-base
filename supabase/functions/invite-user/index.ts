import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('📥 Body recebido:', JSON.stringify(body))

    const { email, nome, role } = body

    if (!email || !nome || !role) {
      console.log('❌ Campos faltando:', { email, nome, role })
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: email, nome, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      secretKeys['ritated'],
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    console.log('🔍 Buscando usuários existentes...')
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.log('❌ Erro ao listar usuários:', listError.message)
      return new Response(
        JSON.stringify({ error: listError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('👥 Total de usuários encontrados:', users.length)

    const existente = users.find(u => u.email === email)

    if (existente) {
      console.log('⚠️ E-mail já cadastrado:', email)
      return new Response(
        JSON.stringify({ error: 'Já existe um usuário cadastrado com este e-mail.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📧 Enviando convite para:', email)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { nome, role },
      redirectTo: 'https://www.suaigreja.com/login.html'
    })

    if (inviteError) {
      console.log('❌ Erro ao convidar:', inviteError.message, inviteError.status)
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Usuário convidado com ID:', inviteData.user.id)

    // Cria perfil
    const { error: perfilError } = await supabaseAdmin
      .from('perfis')
      .upsert({
        id:    inviteData.user.id,
        nome,
        email,
        role,
        ativo: true,
      }, { onConflict: 'id' })

    if (perfilError) {
      console.log('❌ Erro ao criar perfil:', perfilError.message)
    } else {
      console.log('✅ Perfil criado com sucesso')
    }

    // Sem bootstrap de permissoes — fail-closed em permissoes_granular.
    // Admin abre o modal de permissoes apos criar e marca as abas.

    return new Response(
      JSON.stringify({ success: true, userId: inviteData.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.log('💥 Erro geral:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
