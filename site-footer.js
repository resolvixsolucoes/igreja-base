// Footer compartilhado do site publico.
// Coloque <div data-site-footer></div> onde o footer deve aparecer e
// inclua <script src="site-footer.js"></script> antes do </body>.
// O script injeta estilos + markup; nao precisa duplicar CSS na pagina.
// IMPORTANTE: config.js deve ser carregado ANTES deste script.
(function () {
  const cfg = window.APP_CONFIG || {}
  const nome     = cfg.NOME_IGREJA || 'Sua Igreja'
  const tagline  = cfg.TAGLINE || ''
  const redes    = cfg.REDES_SOCIAIS || {}
  const endereco = cfg.ENDERECO || {}
  const contatos = cfg.CONTATOS || {}
  const culto    = cfg.CULTO_PRINCIPAL || {}

  const css = `
    footer { background: var(--brand-dark, #0E5F5F); padding: 20px 0 12px; display: flex; flex-direction: column; gap: 14px; }
    .footer-top { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; width: 100%; padding: 0 80px; gap: 24px; }
    .footer-left { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
    .footer-logo img { height: 28px; object-fit: contain; }
    .footer-tagline { font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.5; margin: 0; }
    .footer-redes { display: flex; gap: 6px; }
    .footer-redes a {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.30); background: rgba(255,255,255,0.10);
      color: rgba(255,255,255,0.80); text-decoration: none; transition: all 0.2s;
    }
    .footer-redes a:hover { background: rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.80); color: #fff; transform: translateY(-2px); }
    .footer-redes a svg { width: 12px; height: 12px; }
    .footer-center { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .footer-center h3 { color: #fff; font-size: 12px; font-weight: 800; margin: 0 0 2px; }
    .footer-center-line {
      display: inline-flex; align-items: flex-start; justify-content: center; gap: 4px;
      color: rgba(255,255,255,0.75); font-size: 11px; line-height: 1.55;
      text-decoration: none; transition: color 0.2s;
    }
    .footer-center-line:hover { color: #fff; }
    .footer-center-line svg { width: 11px; height: 11px; flex-shrink: 0; margin-top: 2px; }
    .footer-phone-center { display: flex; align-items: center; justify-content: center; gap: 4px; color: rgba(255,255,255,0.75); font-size: 11px; font-weight: 600; text-decoration: none; transition: color 0.2s; }
    .footer-phone-center:hover { color: #fff; }
    .footer-phone-center svg { width: 11px; height: 11px; }
    .footer-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; text-align: right; }
    .footer-culto-dia     { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.55); }
    .footer-culto-horario { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.90); }
    .footer-culto-desc    { font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.5; }
    .footer-divider { width: calc(100% - 160px); margin: 0 auto; height: 1px; background: rgba(255,255,255,0.15); }
    .footer-copy { font-size: 10px; color: rgba(255,255,255,0.40); text-align: center; margin: 0; }
    @media (max-width: 768px) {
      .footer-top { grid-template-columns: 1fr; padding: 0 24px; gap: 20px; }
      .footer-left  { align-items: center; }
      .footer-tagline { text-align: center; }
      .footer-right { align-items: center; text-align: center; }
      .footer-divider { width: calc(100% - 48px); }
    }
  `;

  const svgInstagram = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
  const svgYoutube   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
  const svgSpotify   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
  const svgFacebook  = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82V14.706h-3.13v-3.622h3.13V8.413c0-3.1 1.894-4.788 4.66-4.788 1.325 0 2.464.098 2.795.143v3.24h-1.918c-1.504 0-1.794.716-1.794 1.764v2.31h3.588l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.407 24 22.676V1.325C24 .593 23.407 0 22.675 0z"/></svg>`;
  const svgLocal     = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  const svgWhats     = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/></svg>`;

  function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

  function redeAnchor(url, title, svg) {
    if (!url) return ''
    return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}">${svg}</a>`
  }

  const redesHtml = [
    redeAnchor(redes.instagram, 'Instagram', svgInstagram),
    redeAnchor(redes.youtube,   'YouTube',   svgYoutube),
    redeAnchor(redes.spotify,   'Spotify',   svgSpotify),
    redeAnchor(redes.facebook,  'Facebook',  svgFacebook),
  ].join('')

  const mapsQuery = endereco.maps_query || [endereco.logradouro, endereco.cidade, endereco.uf].filter(Boolean).join(', ')
  const mapsHref  = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : ''
  const enderecoLinha1 = endereco.logradouro || ''
  const enderecoLinha2 = [endereco.cidade, endereco.uf].filter(Boolean).join(' - ') + (endereco.cep ? `, ${endereco.cep}` : '')

  const whatsHref  = contatos.whatsapp ? `https://wa.me/${contatos.whatsapp}` : ''
  const whatsLabel = contatos.whatsapp_label || contatos.whatsapp || ''

  const html = `
<footer>
  <div class="footer-top">
    <div class="footer-left">
      <div class="footer-logo"><img src="logo.png" alt="${esc(nome)}" /></div>
      ${tagline ? `<p class="footer-tagline">${esc(tagline)}</p>` : ''}
      <div class="footer-redes">${redesHtml}</div>
    </div>
    <div class="footer-center">
      <h3>${esc(nome)}</h3>
      ${mapsHref ? `<a class="footer-center-line" href="${esc(mapsHref)}" target="_blank" rel="noopener">
        ${svgLocal}
        <span>${esc(enderecoLinha1)}<br/>${esc(enderecoLinha2)}</span>
      </a>` : ''}
      ${whatsHref ? `<a class="footer-phone-center" href="${esc(whatsHref)}" target="_blank" rel="noopener">
        ${svgWhats}
        ${esc(whatsLabel)}
      </a>` : ''}
    </div>
    <div class="footer-right">
      ${culto.dia ? `<span class="footer-culto-dia">${esc(culto.dia)}</span>` : ''}
      ${culto.horario ? `<span class="footer-culto-horario">${esc(culto.horario)}</span>` : ''}
      ${culto.descricao ? `<span class="footer-culto-desc">${esc(culto.descricao)}</span>` : ''}
    </div>
  </div>
  <div class="footer-divider"></div>
  <p class="footer-copy">&copy; <span data-footer-year></span> ${esc(nome)} — Todos os direitos reservados</p>
</footer>`;

  function injectStyles() {
    if (document.getElementById('site-footer-styles')) return;
    const style = document.createElement('style');
    style.id = 'site-footer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function render() {
    injectStyles();
    document.querySelectorAll('[data-site-footer]').forEach((el) => {
      el.outerHTML = html;
    });
    document.querySelectorAll('[data-footer-year]').forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
