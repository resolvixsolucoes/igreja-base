// =============================================
// CONFIGURAÇÃO DA IGREJA
// Preencha os campos abaixo antes de subir a plataforma.
// Todos os outros arquivos (HTMLs, JS) leem daqui.
// =============================================

window.APP_CONFIG = {
  // Nome exibido no site, e-mails, títulos das páginas
  NOME_IGREJA: 'Sua Igreja',

  // Slug curto (sem espaços, sem acentos) — usado em identificadores internos
  SLUG_IGREJA: 'sua-igreja',

  // Domínio público da plataforma (sem protocolo)
  DOMINIO: 'suaigreja.com',

  // Slogan/tagline curta (aparece no rodapé)
  TAGLINE: 'Bíblica, Simples e Contemporânea.',

  // Credenciais do projeto Supabase da igreja
  // Encontre em: Dashboard Supabase → Project Settings → API
  SUPABASE_URL: 'https://SEU_PROJETO.supabase.co',
  SUPABASE_KEY: 'sua_publishable_key_aqui',

  // Cores da identidade visual (aceita hex ou qualquer valor CSS)
  CORES: {
    primaria:   '#0EA5E9',
    secundaria: '#0284C7',
    destaque:   '#F59E0B',
  },

  // Contatos institucionais
  CONTATOS: {
    email_geral:    'contato@suaigreja.com',
    email_pastoral: 'pastoral@suaigreja.com',
    whatsapp:       '',   // ex: '5511999999999' (DDI + DDD + número)
    whatsapp_label: '',   // ex: '(11) 99999-9999'
  },

  // Endereço físico da sede
  ENDERECO: {
    logradouro: 'Rua Exemplo, 123 — Bairro',
    cidade:     'Sua Cidade',
    uf:         'UF',
    cep:        '00000-000',
    // Query livre para o link do Google Maps
    maps_query: 'Rua Exemplo, 123, Bairro, Sua Cidade, UF',
  },

  // Cidade padrão para preencher membros sem endereço explícito (opcional)
  CIDADE_PADRAO: '',

  // Redes sociais (deixe vazio '' para ocultar do rodapé)
  REDES_SOCIAIS: {
    instagram: '',   // ex: 'https://www.instagram.com/suaigreja/'
    youtube:   '',   // ex: 'https://www.youtube.com/@suaigreja'
    spotify:   '',   // ex: 'https://open.spotify.com/show/xxxxx'
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
    chave:   '',                    // ex: '12.345.678/0001-90' (CNPJ) ou e-mail/celular
    titular: 'Sua Igreja',          // nome que aparece no label
    banco:   '',                    // ex: 'Banco X'
    tipo:    'CNPJ',                // rótulo do tipo da chave
  },

  // ID do vídeo do YouTube que aparece na home (deixe vazio pra esconder)
  VIDEO_APRESENTACAO: '',

  // Assinatura digital do pastor (caminho relativo, opcional)
  ASSINATURA_PASTOR: 'plataforma/assets/assinatura-pastor.png',
}
