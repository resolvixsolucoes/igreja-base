// criar-pagamento-pagseguro
// Modo "Pagamento por Link" — cada curso tem seu próprio link estático
// gerado manualmente no painel PagBank (cursos_lms.pagamento_url).
// Esta function apenas registra a tentativa em pagamentos_lms (pra
// rastreio/auditoria) e devolve o link estático ao front.
//
// Ativação da matrícula é feita manualmente após confirmar o pagamento
// no painel PagBank (UPDATE em matriculas_lms via admin/SQL). Quando
// o webhook automatizado estiver pronto, esta etapa fica automática.
//
// Secrets necessários:
//   SUPABASE_URL         → default
//   SUPABASE_SECRET_KEYS → default (uso a chave 'ritated' como service_role)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    // ── Auth ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResp(401, { error: 'Não autenticado' })
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(SUPABASE_URL, secretKeys['ritated'], {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user) return jsonResp(401, { error: 'Token inválido' })
    const userId = userData.user.id

    // ── Body ────────────────────────────────────────────────
    const { curso_id } = await req.json()
    if (!curso_id) return jsonResp(400, { error: 'curso_id obrigatório' })

    // ── Aluno ───────────────────────────────────────────────
    const { data: aluno, error: alunoErr } = await admin
      .from('alunos')
      .select('id, nome, email, is_membro')
      .eq('id', userId)
      .maybeSingle()
    if (alunoErr || !aluno) return jsonResp(404, { error: 'Aluno não encontrado' })

    // ── Curso ───────────────────────────────────────────────
    const { data: curso, error: cursoErr } = await admin
      .from('cursos_lms')
      .select('id, titulo, preco, publicado, gratuito_para_membros, pagamento_url')
      .eq('id', curso_id)
      .maybeSingle()
    if (cursoErr || !curso) return jsonResp(404, { error: 'Curso não encontrado' })
    if (!curso.publicado) return jsonResp(403, { error: 'Curso não está publicado' })

    if (aluno.is_membro && curso.gratuito_para_membros) {
      return jsonResp(400, { error: 'Curso é gratuito para membros' })
    }

    const valor = Number(curso.preco || 0)
    if (!valor || valor <= 0) return jsonResp(400, { error: 'Curso sem preço configurado' })

    if (!curso.pagamento_url) {
      return jsonResp(503, {
        error: 'Link de pagamento não configurado para este curso. Contate o administrador.',
      })
    }

    // ── Já tem matrícula ativa? ─────────────────────────────
    const { data: matriculaExistente } = await admin
      .from('matriculas_lms')
      .select('id, status')
      .eq('aluno_id', userId)
      .eq('curso_id', curso_id)
      .in('status', ['ativa', 'concluida'])
      .maybeSingle()
    if (matriculaExistente) {
      return jsonResp(400, { error: 'Aluno já matriculado neste curso' })
    }

    // ── Reaproveita pendente recente (últimos 30 min) ───────
    const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: pendente } = await admin
      .from('pagamentos_lms')
      .select('id, pay_url, created_at')
      .eq('aluno_id', userId)
      .eq('curso_id', curso_id)
      .eq('status', 'pendente')
      .gte('created_at', trintaMinAtras)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pendente?.pay_url) {
      return jsonResp(200, {
        pagamento_id: pendente.id,
        pay_url: pendente.pay_url,
        reused: true,
      })
    }

    // ── Cria linha pagamentos_lms (rastreio) ────────────────
    const { data: pagamento, error: pagErr } = await admin
      .from('pagamentos_lms')
      .insert({
        aluno_id: userId,
        curso_id,
        valor,
        status:  'pendente',
        gateway: 'pagseguro',
        pay_url: curso.pagamento_url,
      })
      .select()
      .single()
    if (pagErr || !pagamento) {
      console.error('insert pagamentos_lms falhou:', pagErr)
      return jsonResp(500, { error: 'Falha ao registrar pagamento' })
    }

    return jsonResp(200, {
      pagamento_id: pagamento.id,
      pay_url: curso.pagamento_url,
    })
  } catch (err: any) {
    console.error('criar-pagamento-pagseguro erro:', err?.message)
    return jsonResp(500, { error: err?.message || 'Erro interno' })
  }
})
