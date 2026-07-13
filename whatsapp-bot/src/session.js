const Redis = require('ioredis')

let _redis = null

function getRedis() {
  if (!_redis) {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL não definida')
    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    })
    _redis.on('error', (err) => console.error('[Redis] erro de conexão:', err.message))
  }
  return _redis
}

const SESSION_TTL = 60 * 30 // 30 minutos

async function getSession(phone) {
  const raw = await getRedis().get(`bot:session:${phone}`)
  return raw ? JSON.parse(raw) : null
}

async function setSession(phone, data) {
  await getRedis().set(`bot:session:${phone}`, JSON.stringify(data), 'EX', SESSION_TTL)
}

async function deleteSession(phone) {
  await getRedis().del(`bot:session:${phone}`)
}

module.exports = { getRedis, getSession, setSession, deleteSession }
