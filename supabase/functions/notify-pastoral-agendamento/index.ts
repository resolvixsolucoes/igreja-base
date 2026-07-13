// notify-pastoral-agendamento
// Envia email pro conselheiro avisando de novo pedido de aconselhamento.
//
// Secrets necessarios (configurar via Supabase Dashboard → Edge Functions → secrets):
//   RESEND_API_KEY     → re_xxx (Resend API key)
//   PASTORAL_FROM_EMAIL → ex: "Sua Igreja <agenda@suaigreja.com>" (opcional)
//   SUPABASE_URL       → ja vem por default
//   SUPABASE_SECRET_KEYS → ja existe (uso a chave 'ritated' como service_role)
//
// Body: { agendamento_id: string }
// Permitido sem JWT (chamado da pagina publica de agendamento).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM = Deno.env.get('PASTORAL_FROM_EMAIL') || 'Sua Igreja <agenda@suaigreja.com>'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { agendamento_id } = await req.json()
    if (!agendamento_id) {
      return json({ error: 'agendamento_id obrigatorio' }, 400)
    }

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      secretKeys['ritated'],
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Busca dados do agendamento + conselheiro + disponibilidade
    const { data: ag, error: agErr } = await supabase
      .from('pastoral_agendamentos')
      .select(`
        id, nome_fiel, telefone_fiel, motivo, slot_hora, status,
        conselheiros ( id, nome, membro_id ),
        pastoral_disponibilidade ( data, hora_inicio, hora_fim )
      `)
      .eq('id', agendamento_id)
      .maybeSingle()

    if (agErr || !ag) {
      console.log('agendamento nao encontrado:', agErr?.message)
      return json({ error: 'agendamento nao encontrado' }, 404)
    }

    const conselheiro: any = ag.conselheiros
    const disp: any        = ag.pastoral_disponibilidade
    if (!conselheiro?.membro_id) {
      return json({ skipped: 'conselheiro sem membro_id vinculado' }, 200)
    }

    // Busca email do conselheiro via perfis (perfis.membro_id → auth.users.email)
    const { data: perfil, error: perfErr } = await supabase
      .from('perfis')
      .select('id, nome')
      .eq('membro_id', conselheiro.membro_id)
      .maybeSingle()

    if (perfErr || !perfil) {
      return json({ skipped: 'conselheiro sem perfil de usuario' }, 200)
    }

    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(perfil.id)
    if (userErr || !userRes?.user?.email) {
      return json({ skipped: 'conselheiro sem email' }, 200)
    }
    const toEmail: string = userRes.user.email

    // Monta email
    const dataFmt = disp?.data
      ? new Date(disp.data + 'T00:00:00').toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        })
      : '—'
    const hora = (ag.slot_hora || '').slice(0, 5)

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2e2d;">
        <h2 style="color:#2BBFB3;margin:0 0 16px;">🤝 Novo pedido de aconselhamento</h2>
        <p>Olá <strong>${escapeHtml(conselheiro.nome || perfil.nome || '')}</strong>,</p>
        <p>Você recebeu um novo pedido de aconselhamento pastoral:</p>
        <div style="background:#f8fffe;border:1px solid #d0f0ee;border-radius:10px;padding:14px 18px;margin:14px 0;">
          <p style="margin:4px 0;"><strong>👤 Pessoa:</strong> ${escapeHtml(ag.nome_fiel || '')}</p>
          <p style="margin:4px 0;"><strong>📞 Telefone:</strong> ${escapeHtml(ag.telefone_fiel || '')}</p>
          <p style="margin:4px 0;"><strong>📅 Data:</strong> ${escapeHtml(dataFmt)}</p>
          <p style="margin:4px 0;"><strong>⏰ Horário:</strong> ${escapeHtml(hora)}</p>
          ${ag.motivo ? `<p style="margin:8px 0 0;"><strong>💬 Motivo:</strong><br/>${escapeHtml(ag.motivo)}</p>` : ''}
        </div>
        <p>Acesse a agenda para confirmar ou ajustar o status:</p>
        <p style="margin:18px 0;">
          <a href="https://www.suaigreja.com/agenda.html"
             style="background:#2BBFB3;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">
            Abrir agenda
          </a>
        </p>
        <p style="font-size:12px;color:#888;margin-top:24px;">
          Sua Igreja · este email foi enviado automaticamente, não responda.
        </p>
      </div>
    `

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY nao configurada' }, 500)
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [toEmail],
        subject: `🤝 Novo aconselhamento — ${ag.nome_fiel || ''}`.trim(),
        html,
      }),
    })

    const respBody = await resp.text()
    if (!resp.ok) {
      console.log('resend erro', resp.status, respBody)
      return json({ error: 'resend falhou', status: resp.status, body: respBody }, 500)
    }

    return json({ ok: true, sent_to: toEmail })
  } catch (e) {
    console.log('exceção:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string) {
  return (s || '').replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c] as string))
}
