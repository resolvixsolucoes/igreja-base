const { getSession, setSession, deleteSession } = require('./session')
const { salvarVisitante } = require('./supabase')
const { enviarMensagem } = require('./whatsapp')

const ESTADOS = {
  INICIO: 'INICIO',
  AGUARDANDO_NOME: 'AGUARDANDO_NOME',
  AGUARDANDO_EMAIL: 'AGUARDANDO_EMAIL',
  AGUARDANDO_NASCIMENTO: 'AGUARDANDO_NASCIMENTO',
  AGUARDANDO_BAIRRO: 'AGUARDANDO_BAIRRO',
  AGUARDANDO_COMO_CONHECEU: 'AGUARDANDO_COMO_CONHECEU',
  AGUARDANDO_PROGRAMACOES: 'AGUARDANDO_PROGRAMACOES',
  CONCLUIDO: 'CONCLUIDO',
}

const COMO_CONHECEU_OPCOES = {
  '1': 'Indicação de amigo ou familiar',
  '2': 'Instagram / redes sociais',
  '3': 'Passando pela rua',
  '4': 'Outro',
}

function normalizeDate(input) {
  // Aceita DD/MM/AAAA, DD-MM-AAAA ou DDMMAAAA
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  const date = new Date(`${year}-${month}-${day}`)
  if (isNaN(date.getTime())) return null
  if (date.getFullYear() < 1900 || date.getFullYear() > new Date().getFullYear()) return null
  return `${year}-${month}-${day}`
}

function isValidEmail(input) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

async function processar(telefone, textoRaw) {
  const texto = textoRaw.trim()
  let sessao = await getSession(telefone)

  // Primeira mensagem ou sessão expirada
  if (!sessao || sessao.estado === ESTADOS.CONCLUIDO) {
    sessao = { estado: ESTADOS.INICIO, dados: { telefone } }
  }

  switch (sessao.estado) {
    case ESTADOS.INICIO: {
      await enviarMensagem(
        telefone,
        `Olá! Seja bem-vindo(a) à *Ministério Semente* 🙏\n\nFicamos felizes com sua visita! Para que possamos te conhecer melhor, vou fazer algumas perguntas rápidas.\n\nQual é o seu *nome completo*?`
      )
      sessao.estado = ESTADOS.AGUARDANDO_NOME
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_NOME: {
      if (texto.length < 3) {
        await enviarMensagem(telefone, 'Por favor, informe seu nome completo.')
        break
      }
      sessao.dados.nome = texto
      await enviarMensagem(
        telefone,
        `Obrigado, *${texto.split(' ')[0]}*! 😊\n\nQual é o seu *e-mail*? (ou responda *não tenho* para pular)`
      )
      sessao.estado = ESTADOS.AGUARDANDO_EMAIL
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_EMAIL: {
      const semEmail = /^(nao|não|n|sem|pular|-)$/i.test(texto)
      if (!semEmail && !isValidEmail(texto)) {
        await enviarMensagem(
          telefone,
          'E-mail inválido. Por favor, informe um e-mail válido ou responda *não tenho* para pular.'
        )
        break
      }
      sessao.dados.email = semEmail ? null : texto.toLowerCase()
      await enviarMensagem(
        telefone,
        `Qual é a sua *data de nascimento*?\n\n_Formato: DD/MM/AAAA — ex: 15/03/1990_`
      )
      sessao.estado = ESTADOS.AGUARDANDO_NASCIMENTO
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_NASCIMENTO: {
      const data = normalizeDate(texto)
      if (!data) {
        await enviarMensagem(
          telefone,
          'Não consegui reconhecer essa data. Por favor, use o formato *DD/MM/AAAA* (ex: 15/03/1990).'
        )
        break
      }
      sessao.dados.dataNascimento = data
      await enviarMensagem(telefone, `Em qual *bairro e cidade* você mora?\n\n_Ex: Savassi, Belo Horizonte_`)
      sessao.estado = ESTADOS.AGUARDANDO_BAIRRO
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_BAIRRO: {
      if (texto.length < 2) {
        await enviarMensagem(telefone, 'Por favor, informe seu bairro e cidade.')
        break
      }
      sessao.dados.bairro = texto
      await enviarMensagem(
        telefone,
        `Como você *conheceu a Ministério Semente*? Responda com o número:\n\n1️⃣ Indicação de amigo ou familiar\n2️⃣ Instagram / redes sociais\n3️⃣ Passando pela rua\n4️⃣ Outro`
      )
      sessao.estado = ESTADOS.AGUARDANDO_COMO_CONHECEU
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_COMO_CONHECEU: {
      const opcao = COMO_CONHECEU_OPCOES[texto]
      if (!opcao) {
        await enviarMensagem(
          telefone,
          'Por favor, responda com *1*, *2*, *3* ou *4*.\n\n1️⃣ Indicação de amigo ou familiar\n2️⃣ Instagram / redes sociais\n3️⃣ Passando pela rua\n4️⃣ Outro'
        )
        break
      }
      sessao.dados.comoConheceu = opcao
      await enviarMensagem(
        telefone,
        `Deseja receber informações sobre as *programações do Ministério Semente* pelo WhatsApp?\n\n1️⃣ Sim, quero receber\n2️⃣ Não, obrigado`
      )
      sessao.estado = ESTADOS.AGUARDANDO_PROGRAMACOES
      await setSession(telefone, sessao)
      break
    }

    case ESTADOS.AGUARDANDO_PROGRAMACOES: {
      if (!['1', '2'].includes(texto)) {
        await enviarMensagem(telefone, 'Por favor, responda *1* para Sim ou *2* para Não.')
        break
      }
      sessao.dados.receberProgramacoes = texto === '1'

      try {
        await salvarVisitante(sessao.dados)
        sessao.estado = ESTADOS.CONCLUIDO
        await setSession(telefone, sessao)

        const nome = sessao.dados.nome.split(' ')[0]
        await enviarMensagem(
          telefone,
          `✅ *Tudo certo, ${nome}!*\n\nSeu registro foi realizado com sucesso. Nossa equipe pastoral entrará em contato em breve.\n\nQue Deus te abençoe! 🙏`
        )
      } catch (err) {
        console.error('[Bot] Erro ao salvar visitante:', err.message)
        await enviarMensagem(
          telefone,
          'Ocorreu um erro ao salvar seu registro. Por favor, tente novamente mais tarde ou fale com um de nossos voluntários.'
        )
      }
      break
    }
  }
}

module.exports = { processar }
