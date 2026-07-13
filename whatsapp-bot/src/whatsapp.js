const { default: makeWASocket, DisconnectReason, initAuthCreds, proto, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const { getRedis } = require('./session')

// ─── Auth state persistido no Redis ──────────────────────────────────────────

const AUTH_PREFIX = 'baileys:auth'

async function clearAuthState() {
  const redis = getRedis()
  const keys = await redis.keys(`${AUTH_PREFIX}:*`)
  if (keys.length > 0) {
    await redis.del(...keys)
    console.log(`[Bot] Auth state limpo (${keys.length} chaves removidas)`)
  }
}

async function useRedisAuthState() {
  const redis = getRedis()

  const writeData = async (data, key) => {
    await redis.set(`${AUTH_PREFIX}:${key}`, JSON.stringify(data))
  }

  const readData = async (key) => {
    const raw = await redis.get(`${AUTH_PREFIX}:${key}`)
    return raw ? JSON.parse(raw) : null
  }

  const storedCreds = await readData('creds')
  const creds = storedCreds || initAuthCreds()

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {}
        await Promise.all(
          ids.map(async (id) => {
            let value = await readData(`${type}-${id}`)
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            data[id] = value
          })
        )
        return data
      },
      set: async (data) => {
        const tasks = []
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id]
            const key = `${category}-${id}`
            tasks.push(
              value
                ? writeData(value, key)
                : redis.del(`${AUTH_PREFIX}:${key}`)
            )
          }
        }
        await Promise.all(tasks)
      },
    },
  }

  const saveCreds = async () => {
    await writeData(creds, 'creds')
  }

  return { state, saveCreds }
}

// ─── Conexão Baileys ─────────────────────────────────────────────────────────

let sock = null
let _messageHandler = null

function setMessageHandler(fn) {
  _messageHandler = fn
}

async function enviarMensagem(telefone, texto) {
  if (!sock) throw new Error('WhatsApp não conectado')
  await sock.sendMessage(telefone, { text: texto })
}

async function conectar() {
  // Busca versão atual do WhatsApp Web (evita rejeição por versão desatualizada)
  let version = [2, 3000, 1017220321]
  try {
    const latest = await fetchLatestBaileysVersion()
    version = latest.version
    console.log(`[Bot] WhatsApp versão: ${version.join('.')} (isLatest: ${latest.isLatest})`)
  } catch (e) {
    console.log('[Bot] Não foi possível buscar versão atual, usando padrão:', version.join('.'))
  }

  const { state, saveCreds } = await useRedisAuthState()
  const logger = pino({ level: 'info' })

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`
      console.log('[Bot] ================================================')
      console.log('[Bot] Abra o link abaixo para escanear o QR Code:')
      console.log('[Bot]', url)
      console.log('[Bot] ================================================')
    }

    if (connection === 'close') {
      const boom = new Boom(lastDisconnect?.error)
      const code = boom?.output?.statusCode
      const msg = boom?.message || lastDisconnect?.error?.message || 'sem detalhe'

      console.log(`[Bot] Conexão fechada — código: ${code}, motivo: ${msg}`)

      // 405 = connectionReplaced → limpa credenciais e tenta QR novo
      if (code === DisconnectReason.connectionReplaced) {
        console.log('[Bot] Sessão substituída. Limpando auth state e reiniciando...')
        await clearAuthState()
        setTimeout(conectar, 3000)
        return
      }

      // 401 = deslogado → não reconecta, exige novo QR
      if (code === DisconnectReason.loggedOut) {
        console.log('[Bot] Sessão encerrada. Limpando auth state...')
        await clearAuthState()
        setTimeout(conectar, 3000)
        return
      }

      // Outros erros → reconecta normalmente
      console.log('[Bot] Reconectando em 5s...')
      setTimeout(conectar, 5000)

    } else if (connection === 'open') {
      console.log('[Bot] ✅ WhatsApp conectado!')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    if (!_messageHandler) return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (!msg.key.remoteJid) continue
      if (msg.key.remoteJid.includes('@g.us')) continue

      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''

      if (!texto.trim()) continue

      const telefone = msg.key.remoteJid
      console.log(`[Bot] ${telefone}: "${texto.trim()}"`)

      try {
        await _messageHandler(telefone, texto.trim())
      } catch (err) {
        console.error(`[Bot] Erro ao processar ${telefone}:`, err.message)
      }
    }
  })
}

module.exports = { conectar, enviarMensagem, setMessageHandler }
