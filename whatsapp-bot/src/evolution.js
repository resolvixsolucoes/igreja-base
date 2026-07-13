/**
 * Envia uma mensagem de texto via Evolution API.
 */
async function enviarMensagem(telefone, texto) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: telefone,
      textMessage: { text: texto },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API ${res.status}: ${body}`)
  }
}

/**
 * Extrai telefone e texto de um payload de webhook da Evolution API.
 * Retorna null se a mensagem não for processável (grupos, mídia sem texto, etc).
 */
function parseWebhook(body) {
  const data = body?.data
  if (!data) return null

  // Ignora mensagens enviadas pelo próprio bot
  if (data.key?.fromMe) return null

  // Ignora grupos
  const jid = data.key?.remoteJid ?? ''
  if (jid.includes('@g.us')) return null

  const texto =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    ''

  if (!texto.trim()) return null

  // Usa o JID completo como identificador — a Evolution API aceita para envio
  const telefone = jid

  return { telefone, jid, texto: texto.trim() }
}

module.exports = { enviarMensagem, parseWebhook }
