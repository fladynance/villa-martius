/* Villa Martius — interactions */
(function () {
  'use strict';

  // Rimuove il badge "Powered by Netlify" iniettato da Netlify (a volte forzato
  // visibile): lo si elimina dal DOM e si osserva se viene reinserito.
  (function () {
    var kill = function () { var b = document.getElementById('nl-badge-frame'); if (b) b.remove(); };
    kill();
    try { new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  })();

  // Nav scroll state
  var nav = document.querySelector('.nav');
  if (nav && !nav.classList.contains('solid')) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Freccia nella nav — torna alla pagina precedente del sito.
  // Se la pagina è stata aperta da fuori (link diretto, nuova scheda) non c'è
  // una pagina precedente del sito: in quel caso porta a esplora.
  // Su esplora.html il bottone non è nemmeno nell'HTML (nav.v2.no-back).
  var navBack = document.getElementById('navBack');
  if (navBack) {
    navBack.addEventListener('click', function () {
      var fromSite = false;
      try {
        fromSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch (e) {}
      if (fromSite && window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'esplora.html';
      }
    });
  }

  // Mobile menu
  var hamburger  = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobileMenu');
  var menuClose  = document.getElementById('menuClose');

  function openMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (menuClose) menuClose.focus();
  }
  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (hamburger) hamburger.focus();
  }
  if (hamburger)  hamburger.addEventListener('click', openMenu);
  if (menuClose)  menuClose.addEventListener('click', closeMenu);
  if (mobileMenu) {
    mobileMenu.querySelectorAll('.menu-link').forEach(function (l) {
      l.addEventListener('click', closeMenu);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('open')) closeMenu();
  });

  // Smooth-scroll for same-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (href.length < 2) return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Form (client-side placeholder — user wires their own backend/Formspree)
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.textContent = 'Richiesta inviata ✓';
        btn.disabled = true;
        btn.style.background = 'var(--gold)';
        btn.style.borderColor = 'var(--gold)';
      }
    });
  }

  // Controllo disponibilità dal form .rd-book (pagine camera/appartamento).
  // Se le date sono compilate, verifica prima di mandare alla pagina di prenotazione,
  // così l'ospite vede subito se quelle date non sono libere.
  var availForm = document.querySelector('form.rd-book');
  if (availForm) {
    var availMsg = document.createElement('div');
    availMsg.className = 'rd-avail';
    availMsg.setAttribute('role', 'status');
    availForm.insertAdjacentElement('afterend', availMsg);
    var showAvail = function (text, kind) { availMsg.textContent = text; availMsg.className = 'rd-avail on ' + (kind || ''); };
    var fval = function (name) { var el = availForm.querySelector('[name="' + name + '"]'); return el ? el.value : ''; };
    availForm.addEventListener('submit', function (e) {
      var unita = fval('unita'), arrivo = fval('arrivo'), partenza = fval('partenza'), ospiti = fval('ospiti');
      if (!arrivo || !partenza) return; // senza date, navigazione normale a prenota.html
      e.preventDefault();
      if (new Date(partenza + 'T00:00:00') <= new Date(arrivo + 'T00:00:00')) {
        return showAvail('La partenza deve essere successiva all’arrivo.', 'err');
      }
      var qs = 'unita=' + encodeURIComponent(unita) + '&arrivo=' + arrivo + '&partenza=' + partenza;
      var cta = availForm.querySelector('.rd-cta');
      var label = cta ? cta.innerHTML : '';
      if (cta) cta.disabled = true;
      showAvail('Controllo disponibilità…', '');
      fetch('/api/availability?' + qs)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && d.available) {
            window.location.href = 'prenota.html?' + qs + '&ospiti=' + encodeURIComponent(ospiti || '');
          } else {
            if (cta) { cta.disabled = false; cta.innerHTML = label; }
            if (d && d.ok) showAvail('Non disponibile per queste date. Prova a cambiare il periodo.', 'err');
            else showAvail((d && d.message) || 'Controllo non riuscito. Riprova.', 'err');
          }
        })
        .catch(function () { if (cta) { cta.disabled = false; cta.innerHTML = label; } showAvail('Connessione non riuscita. Riprova.', 'err'); });
    });
  }

  // Simple in-view reveal (respects reduced-motion)
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    var els = document.querySelectorAll('[data-reveal]');
    if (els.length) {
      els.forEach(function (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.9s ease, transform 0.9s ease';
      });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      els.forEach(function (el) { io.observe(el); });
    }
  }
})();
