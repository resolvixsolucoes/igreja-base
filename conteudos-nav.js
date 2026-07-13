// conteudos-nav.js — toggle cascata do menu Conteúdos na sidebar

(function () {

  function initConteudosNav() {
    var trigger = document.getElementById('nav-conteudos-trigger');
    var lista   = document.getElementById('nav-conteudos-lista');
    if (!trigger || !lista) return;

    var emConteudos = window.location.pathname.includes('conteudos');

    // Se estiver na página de conteúdos, abre automaticamente e marca o subitem ativo
    if (emConteudos) {
      trigger.classList.add('active');
      lista.style.display = 'block';

      var abaAtual = new URLSearchParams(window.location.search).get('aba') || 'pregacoes';
      lista.querySelectorAll('.nav-min-item').forEach(function(a) {
        a.classList.toggle('active', a.dataset.aba === abaAtual);
      });
    }

    // Toggle ao clicar — usa getComputedStyle para detectar display real (CSS ou inline)
    trigger.addEventListener('click', function () {
      var aberto = window.getComputedStyle(lista).display !== 'none';
      lista.style.display = aberto ? 'none' : 'block';
      trigger.classList.toggle('open', !aberto);
      trigger.classList.toggle('active', emConteudos || !aberto);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initConteudosNav();
  });

})();