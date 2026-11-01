/*!
 * TaxiVeo — en-tête v4 = C (T-050). Sans dépendance, defer.
 * - barre flottante : opaque après 40 px, masquée en descendant (au-delà de 320 px), réaffichée en remontant ;
 * - filet de progression de lecture ;
 * - panneau mobile : aria-expanded, Échap, clic extérieur, retour du focus ;
 * - barre d'onglets : entrée active par préfixe d'URL le plus long.
 */
(function () {
	'use strict';

	var $ = function (s, c) { return (c || document).querySelector(s); };
	var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
	var nav = $('[data-tv-nav]');
	var bar = $('.tv-progress');
	var over = nav && nav.classList.contains('tv-nav--over');
	var lastY = window.scrollY;
	var ticking = false;

	function onScroll() {
		var y = window.scrollY;
		var h = document.documentElement.scrollHeight - window.innerHeight;
		if (bar) { bar.style.setProperty('--p', h > 0 ? Math.min(1, y / h).toFixed(4) : 0); }
		if (nav) {
			if (over) { nav.classList.toggle('is-solid', y > 40); }
			var open = nav.classList.contains('is-open');
			if (!open && y > 320 && y > lastY + 4) { nav.classList.add('is-hidden'); }
			else if (y < lastY - 4 || y < 320) { nav.classList.remove('is-hidden'); }
		}
		lastY = y;
		ticking = false;
	}
	window.addEventListener('scroll', function () {
		if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
	}, { passive: true });
	onScroll();

	/* Panneau mobile */
	var toggle = $('[data-tv-nav-toggle]');
	var panel = $('[data-tv-nav-panel]');
	if (nav && toggle && panel) {
		var setOpen = function (open, focusBack) {
			nav.classList.toggle('is-open', open);
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
			toggle.setAttribute('aria-label', open ? toggle.getAttribute('data-close') : toggle.getAttribute('data-open'));
			if (open) { nav.classList.remove('is-hidden'); }
			if (!open && focusBack) { toggle.focus(); }
		};
		toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false, true); }
		});
		document.addEventListener('click', function (e) {
			if (nav.classList.contains('is-open') && !nav.contains(e.target)) { setOpen(false); }
		});
		panel.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) { setOpen(false); } });
		var mq = window.matchMedia('(min-width: 961px)');
		var onMq = function () { if (mq.matches) { setOpen(false); } };
		if (mq.addEventListener) { mq.addEventListener('change', onMq); } else if (mq.addListener) { mq.addListener(onMq); }
	}

	/* Barre d'onglets : entrée active */
	var tabbar = $('.tv-tabbar');
	if (tabbar) {
		var links = $$('a[href]', tabbar);
		var here = window.location.origin + window.location.pathname;
		var best = null;
		var bestLen = -1;
		links.forEach(function (a) {
			var href = a.href.split('#')[0].split('?')[0];
			var isHome = href.replace(/\/$/, '') === window.location.origin;
			var match = isHome ? here.replace(/\/$/, '') === window.location.origin : here.indexOf(href) === 0;
			if (match && href.length > bestLen) { best = a; bestLen = href.length; }
		});
		links.forEach(function (a) { if (a !== best && a.getAttribute('aria-current')) { a.removeAttribute('aria-current'); } });
		if (best) {
			best.classList.add('is-active');
			if (!best.getAttribute('aria-current')) { best.setAttribute('aria-current', 'page'); }
		}
	}
})();
