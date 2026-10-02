/* Villa Martius — interactions */
(function () {
  'use strict';

  // Nav scroll state
  var nav = document.querySelector('.nav');
  if (nav && !nav.classList.contains('solid')) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Freccia nella nav — torna SEMPRE al hub (esplora.html).
  // Nascosta sulle pagine hub stesse: esplora e matrimoni-eventi.
  var navBack = document.getElementById('navBack');
  if (navBack) {
    var path = (window.location.pathname.split('/').pop() || '').toLowerCase();
    var hubPages = ['esplora.html', 'matrimoni-eventi.html'];
    if (hubPages.indexOf(path) !== -1) {
      navBack.style.display = 'none';
    } else {
      navBack.addEventListener('click', function () {
        window.location.href = 'esplora.html';
      });
    }
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
