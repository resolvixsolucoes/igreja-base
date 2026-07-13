const express = require('express')
const { conectar, setMessageHandler } = require('./whatsapp')
const { processar } = require('./conversation')

const app = express()

// Healthcheck para Railway
app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`[Bot] Servidor rodando na porta ${PORT}`))

// Conecta ao WhatsApp via Baileys
setMessageHandler(processar)
conectar().catch((err) => {
  console.error('[Bot] Erro fatal ao conectar WhatsApp:', err)
  process.exit(1)
})
