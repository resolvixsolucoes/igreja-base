import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// TTL do signed URL: 30min — caber em uma aula sem renovar.
const TTL_SECONDS = 1800

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResp(401, { error: 'Não autenticado' })

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(SUPABASE_URL, secretKeys['ritated'])

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user) return jsonResp(401, { error: 'Token inválido' })
    const userId = userData.user.id

    const { materialId } = await req.json()
    if (!materialId) return jsonResp(400, { error: 'materialId é obrigatório' })

    // Carrega material e resolve curso_id pela chain aula → módulo → curso.
    const { data: material, error: matError } = await admin
      .from('materiais_lms')
      .select('id, url, aula_id, aulas_lms!inner(modulo_id, modulos_lms!inner(curso_id))')
      .eq('id', materialId)
      .single()

    if (matError || !material) return jsonResp(404, { error: 'Material não encontrado' })

    const cursoId = (material as any).aulas_lms?.modulos_lms?.curso_id
    if (!cursoId) return jsonResp(500, { error: 'Curso do material não resolvido' })

    // Autorização: admin OR editor de cursos OR aluno matriculado ativo.
    let autorizado = false

    const { data: perfil } = await admin
      .from('perfis')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    if (perfil?.role === 'admin') autorizado = true

    if (!autorizado) {
      const { data: perm } = await admin
        .from('permissoes_granular')
        .select('ver')
        .eq('user_id', userId)
        .eq('pagina', 'conteudos')
        .eq('aba', 'cursos')
        .maybeSingle()
      if (perm?.ver === true) autorizado = true
    }

    if (!autorizado) {
      const { data: matricula } = await admin
        .from('matriculas_lms')
        .select('id')
        .eq('aluno_id', userId)
        .eq('curso_id', cursoId)
        .eq('status', 'ativa')
        .maybeSingle()
      if (matricula) autorizado = true
    }

    if (!autorizado) return jsonResp(403, { error: 'Acesso negado' })

    // Detecta URL do nosso storage para gerar signed URL.
    // URLs externas (YouTube, etc.) voltam direto.
    const m = (material.url || '').match(/\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)/)
    if (!m) return jsonResp(200, { url: material.url, signed: false })

    const bucket = m[1]
    const path = decodeURIComponent(m[2])

    const { data: signed, error: signError } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, TTL_SECONDS)

    if (signError || !signed?.signedUrl) {
      return jsonResp(500, { error: signError?.message || 'Erro ao gerar URL' })
    }

    return jsonResp(200, { url: signed.signedUrl, signed: true })
  } catch (err: any) {
    console.error('signed-material erro:', err?.message)
    return jsonResp(500, { error: err?.message || 'Erro interno' })
  }
})
