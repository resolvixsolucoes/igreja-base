// supabase/functions/spotify-thumb/index.ts
// Busca thumbnail de faixas do Spotify via Client Credentials (sem login do usuário)
// Deploy: supabase functions deploy spotify-thumb

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const url    = new URL(req.url)
    const trackUrl = url.searchParams.get('url') || ''

    // Extrai o Track ID da URL do Spotify
    const match = trackUrl.match(/spotify\.com(?:\/[a-z\-]+)?\/track\/([A-Za-z0-9]+)/)
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'URL inválida. Use uma URL de faixa do Spotify.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    const trackId = match[1]

    // ── Passo 1: obtém Access Token via Client Credentials ──────────
    const clientId     = Deno.env.get('SPOTIFY_CLIENT_ID')     ?? ''
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET') ?? ''

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do Spotify não configuradas.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return new Response(
        JSON.stringify({ error: 'Falha ao obter token do Spotify', detail: err }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const { access_token } = await tokenRes.json()

    // ── Passo 2: busca dados da faixa ───────────────────────────────
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
    })

    if (!trackRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Faixa não encontrada no Spotify.' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const track = await trackRes.json()

    // Pega a maior imagem disponível
    const images: { url: string; width: number; height: number }[] =
      track.album?.images ?? []
    images.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    const thumbUrl = images[0]?.url ?? null

    return new Response(
      JSON.stringify({
        thumb_url:   thumbUrl,
        titulo:      track.name                          ?? '',
        artista:     track.artists?.map((a: { name: string }) => a.name).join(', ') ?? '',
        album:       track.album?.name                  ?? '',
        duracao_ms:  track.duration_ms                  ?? 0,
        preview_url: track.preview_url                  ?? null,
        track_id:    trackId,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Erro interno', detail: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})