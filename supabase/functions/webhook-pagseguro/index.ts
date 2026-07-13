// webhook-pagseguro
// Recebe notificações do PagSeguro/PagBank Connect e atualiza o status
// do pagamento. Quando o pagamento é confirmado (PAID), cria a matrícula
// ativa pra liberar o curso pro aluno.
//
// Configurar a URL desta função no painel PagBank em
//   Vendas → Integrações → URL de Notificação
// e/ou no campo `notification_urls` enviado no checkout.
//
// Secrets necessários:
//   PAGSEGURO_TOKEN          → mesmo token usado em criar-pagamento-pagseguro
//   PAGSEGURO_WEBHOOK_SECRET → (opcional) hash compartilhado p/ validar origem
//   PAGSEGURO_ENV            → "sandbox" | "production"
//   SUPABASE_URL, SUPABASE_SECRET_KEYS → default

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

function pagseguroBaseUrl() {
  const env = (Deno.env.get('PAGSEGURO_ENV') || 'sandbox').toLowerCase()
  return env === 'production'
    ? 'https://api.pagseguro.com'
    : 'https://sandbox.api.pagseguro.com'
}

// Mapeia status do PagBank → status interno
function mapStatus(psStatus: string): string {
  const s = String(psStatus || '').toUpperCase()
  if (s === 'PAID' || s === 'AUTHORIZED' || s === 'COMPLETED') return 'aprovado'
  if (s === 'DECLINED')                                         return 'recusado'
  if (s === 'CANCELED'  || s === 'CANCELLED')                   return 'cancelado'
  if (s === 'REFUNDED'  || s === 'REVERSED')                    return 'reembolsado'
  return 'pendente'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json().catch(() => ({}))

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(SUPABASE_URL, secretKeys['ritated'], {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // PagBank manda diferentes shapes dependendo do tipo de notificação.
    // Estratégia robusta: tentar achar reference_id (uuid do pagamento)
    // e/ou order/charge id; se só vier o id, consulta a API pra resolver.
    const referenceId: string | undefined =
      payload.reference_id ||
      payload?.order?.reference_id ||
      payload?.charge?.reference_id

    const orderId: string | undefined =
      payload.id ||
      payload?.order?.id ||
      payload?.charge?.id

    let detalhes: any = payload
    let pagamentoId = referenceId

    // Se não veio reference_id no payload, busca no PagBank
    if (!pagamentoId && orderId) {
      const psToken = Deno.env.get('PAGSEGURO_TOKEN')
      if (psToken) {
        const r = await fetch(`${pagseguroBaseUrl()}/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${psToken}`, 'accept': 'application/json' },
        })
        if (r.ok) {
          detalhes = await r.json()
          pagamentoId = detalhes.reference_id
        }
      }
    }

    if (!pagamentoId) {
      console.error('webhook sem reference_id resolvível', payload)
      // Responder 200 mesmo assim pra evitar retry agressivo do gateway
      return jsonResp(200, { ok: false, motivo: 'sem reference_id' })
    }

    // Busca pagamento
    const { data: pagamento, error: pagErr } = await admin
      .from('pagamentos_lms')
      .select('id, aluno_id, curso_id, status, matricula_id')
      .eq('id', pagamentoId)
      .maybeSingle()
    if (pagErr || !pagamento) {
      console.error('pagamento não encontrado:', pagamentoId, pagErr)
      return jsonResp(200, { ok: false, motivo: 'pagamento não encontrado' })
    }

    // Resolve status — pode vir do payload direto ou da consulta /orders
    const psStatus =
      detalhes?.status ||
      detalhes?.charges?.[0]?.status ||
      payload?.status ||
      payload?.charge?.status ||
      ''
    const novoStatus = mapStatus(psStatus)

    // Idempotência: se já tá aprovado, nada a fazer
    if (pagamento.status === 'aprovado' && novoStatus === 'aprovado') {
      return jsonResp(200, { ok: true, ja_processado: true })
    }

    const update: any = {
      status: novoStatus,
      raw:    detalhes,
    }
    const charge = detalhes?.charges?.[0]
    if (charge?.id)                update.gateway_charge_id = charge.id
    if (charge?.payment_method?.type) update.metodo = String(charge.payment_method.type).toLowerCase()

    // Se aprovou, cria matrícula
    if (novoStatus === 'aprovado' && !pagamento.matricula_id) {
      const { data: matricula, error: matErr } = await admin
        .from('matriculas_lms')
        .upsert({
          aluno_id:    pagamento.aluno_id,
          curso_id:    pagamento.curso_id,
          tipo_acesso: 'pago',
          status:      'ativa',
          pagamento_id: pagamento.id,
        }, { onConflict: 'aluno_id,curso_id' })
        .select()
        .single()

      if (matErr) {
        console.error('upsert matricula falhou:', matErr)
      } else if (matricula) {
        update.matricula_id = matricula.id
      }
    }

    const { error: updErr } = await admin
      .from('pagamentos_lms')
      .update(update)
      .eq('id', pagamento.id)
    if (updErr) {
      console.error('update pagamento falhou:', updErr)
      return jsonResp(500, { error: 'falha ao atualizar pagamento' })
    }

    return jsonResp(200, { ok: true, status: novoStatus })
  } catch (err: any) {
    console.error('webhook-pagseguro erro:', err?.message)
    // Responder 200 evita PagSeguro retry agressivo enquanto debugamos
    return jsonResp(200, { ok: false, error: err?.message })
  }
})
