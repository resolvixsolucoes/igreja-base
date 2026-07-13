// =============================================
// CONFIGURAÇÃO DA IGREJA
// Preencha os campos abaixo antes de subir a plataforma.
// Todos os outros arquivos (HTMLs, JS) leem daqui.
// =============================================
// Esta é uma instância de DEMONSTRAÇÃO ("Ministério Semente"),
// mantida pela Resolvix como vitrine pública da plataforma.
// Se você é uma igreja querendo customizar essa base para você,
// substitua todos os campos abaixo pelos seus dados reais.
// =============================================

window.APP_CONFIG = {
  // Nome exibido no site, e-mails, títulos das páginas
  NOME_IGREJA: 'Ministério Semente',

  // Slug curto (sem espaços, sem acentos) — usado em identificadores internos
  SLUG_IGREJA: 'ministerio-semente',

  // Domínio público da plataforma (sem protocolo)
  DOMINIO: 'igreja-base.vercel.app',

  // Slogan/tagline curta (aparece no rodapé)
  TAGLINE: 'Demo da plataforma Igreja Base — Resolvix',

  // Credenciais do projeto Supabase da igreja
  // Encontre em: Dashboard Supabase → Project Settings → API
  SUPABASE_URL: 'https://nwafhurnxwbiyxxhdeuk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_kFcxEeQY5iu2-xtMqmU7JA_FGLNxIGz',

  // Cores da identidade visual (aceita hex ou qualquer valor CSS)
  CORES: {
    primaria:   '#6b8e4e',   // verde-salvia (brand)
    secundaria: '#4a6a35',   // verde profundo
    destaque:   '#c1d8a4',   // verde suave
  },

  // Contatos institucionais
  CONTATOS: {
    email_geral:    'contato@resolvixsolucoes.com.br',
    email_pastoral: 'pastoral@ministeriosemente.demo',
    whatsapp:       '5531991437500',
    whatsapp_label: '(31) 99143-7500',
  },

  // Endereço físico da sede
  ENDERECO: {
    logradouro: 'Endereço fictício, 100',
    cidade:     'Belo Horizonte',
    uf:         'MG',
    cep:        '30000-000',
    maps_query: 'Belo Horizonte, MG',
  },

  // Cidade padrão para preencher membros sem endereço explícito (opcional)
  CIDADE_PADRAO: 'Belo Horizonte',

  // Redes sociais (deixe vazio '' para ocultar do rodapé)
  REDES_SOCIAIS: {
    instagram: '',
    youtube:   '',
    spotify:   '',
    facebook:  '',
  },

  // Horário do culto principal (aparece no rodapé)
  CULTO_PRINCIPAL: {
    dia:      'Domingo',
    horario:  '18:00',
    descricao: 'Participe presencial ou online',
  },

  // PIX para o bloco de generosidade da home (deixe chave vazia pra esconder o bloco)
  PIX: {
    chave:   '',
    titular: 'Ministério Semente',
    banco:   '',
    tipo:    'CNPJ',
  },

  // ID do vídeo do YouTube que aparece na home (deixe vazio pra esconder)
  VIDEO_APRESENTACAO: '',

  // Assinatura digital do pastor (caminho relativo, opcional)
  ASSINATURA_PASTOR: 'plataforma/assets/assinatura-pastor.png',
}
