/*!
 * TaxiVeo — mouvement et composants interactifs v4 = C (T-050). Sans dépendance, defer.
 * - html.is-ready : entrée du Hero (lignes par masque .tv-ml, fondus .tv-fade) ;
 * - .tv-rv, .tv-clip, [data-tv-in] → .in ; .tv-reveal → .is-in (ancien) : révélations au défilement ;
 * - [data-stagger] : pose --i sur les enfants (et --i sur la carte qu'ils contiennent) ;
 * - [data-tv-parallax] : parallaxe douce ; [data-tv-route] : route du Passeport tracée au défilement ;
 * - .tv-seg (role=tablist) : contrôle segmenté à pastille glissante (flèches, Début, Fin) ;
 * - [data-tv-search] : recherche à portées (destination, exemple, aide, « Où ? ») ;
 * - [data-tv-switch] : bascule de panneaux (sortie courte puis cascade) ;
 * - .tv-glow : halo au pointeur ; .tv-countup : compteur (ancien).
 * prefers-reduced-motion : tout est visible et figé ; sans JS : tout est visible (CSS).
 */
(function () {
	'use strict';

	var root = document.documentElement;
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	var $ = function (s, c) { return (c || document).querySelector(s); };
	var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
	var editor = document.body && document.body.classList.contains('elementor-editor-active');

	root.classList.add('tv-js');

	/* Transitions de page (@view-transition dans base.css) : une transition interrompue
	   (navigation rapide, onglet masqué) rejette ses promesses ; on les ignore. */
	var quietTransition = function (e) {
		var vt = e && e.viewTransition;
		if (!vt) { return; }
		['ready', 'finished', 'updateCallbackDone'].forEach(function (k) {
			if (vt[k] && vt[k].catch) { vt[k].catch(function () {}); }
		});
	};
	window.addEventListener('pagereveal', quietTransition);
	window.addEventListener('pageswap', quietTransition);
	var ready = function () { root.classList.add('is-ready'); };
	window.requestAnimationFrame(function () { window.requestAnimationFrame(ready); });
	window.setTimeout(ready, 120);

	/* Décalage d'apparition des enfants */
	$$('[data-stagger], .tv-stagger').forEach(function (list) {
		Array.prototype.slice.call(list.children).forEach(function (child, i) {
			child.style.setProperty('--i', Math.min(i, 8));
			var inner = child.firstElementChild;
			if (inner && (inner.classList.contains('tv-rv') || inner.classList.contains('tv-reveal'))) { inner.style.setProperty('--i', Math.min(i, 8)); }
			if (list.classList.contains('tv-stagger')) { child.classList.add('tv-reveal'); }
		});
	});

	/* Révélations */
	var targets = $$('.tv-rv, .tv-clip, [data-tv-in], .tv-reveal');
	var reveal = function (t) { t.classList.add(t.classList.contains('tv-reveal') ? 'is-in' : 'in'); };
	if (editor || reduce || !('IntersectionObserver' in window)) {
		targets.forEach(reveal);
	} else {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
		}, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
		targets.forEach(function (t) { io.observe(t); });
		window.addEventListener('load', function () {
			targets.forEach(function (t) { if (t.getBoundingClientRect().bottom < 0) { reveal(t); } });
		});
		// Filet de sécurité : rien ne reste caché si l'observateur ne se déclenche pas (onglet en arrière-plan, impression).
		window.addEventListener('beforeprint', function () { targets.forEach(reveal); });
	}

	/* Parallaxe, zoom du Hero, route du Passeport : une seule boucle rAF */
	var hero = $('.tv-chero');
	var heroImg = $('.tv-chero__media img');
	var parallax = $$('[data-tv-parallax]');
	var route = $('[data-tv-route]');
	var steps = route ? $$('li', route) : [];
	var ticking = false;
	function frame() {
		var y = window.scrollY;
		var vh = window.innerHeight;
		if (!reduce) {
			if (heroImg && hero && y < hero.offsetHeight) { heroImg.style.setProperty('--hy', (y * 0.25).toFixed(1) + 'px'); }
			parallax.forEach(function (el) {
				var r = el.getBoundingClientRect();
				if (r.bottom < 0 || r.top > vh) { return; }
				el.style.setProperty('--py', (((r.top + r.height / 2 - vh / 2) / vh) * -44).toFixed(1) + 'px');
			});
		}
		if (route) {
			var rr = route.getBoundingClientRect();
			var p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.8 - rr.top) / (rr.height + vh * 0.35)));
			route.style.setProperty('--route', p.toFixed(3));
			steps.forEach(function (li, i) {
				li.classList.toggle('is-on', p > 0 && p >= (i / Math.max(1, steps.length - 1)) * 0.98 - 0.001);
			});
		}
		ticking = false;
	}
	if (hero || parallax.length || route) {
		window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(frame); } }, { passive: true });
		window.addEventListener('resize', frame);
		frame();
	}

	/* Contrôle segmenté (motif ARIA tablist) avec pastille glissante, en ligne ou en grille */
	function segmented(list, onSelect) {
		var tabs = $$('[role="tab"]', list);
		var ink = $('.tv-seg__ink', list);
		var place = function (tab) {
			if (!ink || !tab) { return; }
			ink.style.setProperty('--x', tab.offsetLeft + 'px');
			ink.style.setProperty('--y', tab.offsetTop + 'px');
			ink.style.setProperty('--w', tab.offsetWidth + 'px');
			ink.style.setProperty('--h', tab.offsetHeight + 'px');
		};
		var select = function (tab, focus) {
			tabs.forEach(function (t) {
				var on = t === tab;
				t.setAttribute('aria-selected', on ? 'true' : 'false');
				t.tabIndex = on ? 0 : -1;
			});
			place(tab);
			if (focus) { tab.focus(); }
			onSelect(tab);
		};
		tabs.forEach(function (t, i) {
			t.addEventListener('click', function () { if (t.getAttribute('aria-selected') !== 'true') { select(t, false); } });
			t.addEventListener('keydown', function (e) {
				var n = null;
				if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { n = tabs[(i + 1) % tabs.length]; }
				if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { n = tabs[(i - 1 + tabs.length) % tabs.length]; }
				if (e.key === 'Home') { n = tabs[0]; }
				if (e.key === 'End') { n = tabs[tabs.length - 1]; }
				if (n) { e.preventDefault(); select(n, true); }
			});
		});
		var current = function () { return $('[aria-selected="true"]', list) || tabs[0]; };
		list.classList.add('is-ready');
		place(current());
		if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { place(current()); }); }
		window.addEventListener('resize', function () { place(current()); });
		window.addEventListener('load', function () { place(current()); });
	}

	/* Recherche à portées : destination, exemple, aide et champ « Où ? » (id ou slug de région) */
	$$('[data-tv-search]').forEach(function (form) {
		var seg = $('.tv-seg', form);
		if (!seg) { return; }
		var input = $('input[name="q"]', form);
		var where = $('[data-tv-where]', form);
		var select = where ? $('select', where) : null;
		var hint = $('[data-tv-search-hint]', form);
		var panel = $('[data-tv-panel]', form);
		segmented(seg, function (tab) {
			form.action = tab.getAttribute('data-url');
			if (input) { input.placeholder = tab.getAttribute('data-ph') || ''; }
			if (panel) { panel.setAttribute('aria-labelledby', tab.id); }
			var mode = tab.getAttribute('data-region') || '';
			if (where && select) {
				select.disabled = '' === mode;
				where.setAttribute('aria-disabled', '' === mode ? 'true' : 'false');
				$$('option[data-id]', select).forEach(function (o) { o.value = 'slug' === mode ? o.getAttribute('data-slug') : o.getAttribute('data-id'); });
			}
			if (hint) {
				var text = tab.getAttribute('data-hint') || '';
				if (reduce) { hint.textContent = text; return; }
				hint.classList.add('is-swap');
				window.setTimeout(function () { hint.textContent = text; hint.classList.remove('is-swap'); }, 180);
			}
		});
		// Requête vide : pas de paramètre « q= » inutile dans l'URL.
		form.addEventListener('submit', function () {
			if (input && '' === input.value.trim()) { input.disabled = true; window.setTimeout(function () { input.disabled = false; }, 0); }
			if (select && '' === select.value && !select.disabled) { select.disabled = true; window.setTimeout(function () { select.disabled = false; }, 0); }
		});
	});

	/* Bascule de panneaux (Emplois / Véhicules) */
	$$('[data-tv-switch]').forEach(function (sw) {
		segmented(sw, function (tab) {
			var next = document.getElementById(tab.getAttribute('aria-controls'));
			if (!next) { return; }
			var prev = $$('.tv-cboard__panel', next.parentNode).filter(function (p) { return !p.hidden && p !== next; })[0];
			var show = function () {
				if (prev) { prev.hidden = true; prev.classList.remove('is-leaving', 'is-entering', 'is-shown'); }
				next.hidden = false;
				next.classList.add('is-shown');
				$$('.tv-rv', next).forEach(function (el) { el.classList.add('in'); });
				if (!reduce) {
					next.classList.remove('is-entering');
					void next.offsetWidth;
					next.classList.add('is-entering');
				}
				var rail = $('[data-tv-rail]', next);
				if (rail) { rail.scrollLeft = 0; }
			};
			if (prev && !reduce) { prev.classList.add('is-leaving'); window.setTimeout(show, 160); } else { show(); }
		});
	});
	// Autres contrôles segmentés autonomes (pastille seulement).
	$$('.tv-seg[role="tablist"]').forEach(function (list) {
		if (!list.classList.contains('is-ready')) { segmented(list, function () {}); }
	});

	/* Halo au pointeur */
	if (fine && !reduce) {
		document.addEventListener('pointermove', function (e) {
			var el = e.target && e.target.closest ? e.target.closest('.tv-glow') : null;
			if (!el) { return; }
			var r = el.getBoundingClientRect();
			el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
			el.style.setProperty('--my', (e.clientY - r.top) + 'px');
		}, { passive: true });
	}

	/* Compteurs (ancien .tv-countup) : le texte final est déjà dans le HTML */
	var counters = $$('.tv-countup');
	if (counters.length && !reduce && 'IntersectionObserver' in window) {
		var countUp = function (el) {
			var text = el.textContent;
			var m = text.match(/^(\D*)(\d{1,6})(.*)$/);
			if (!m || parseInt(m[2], 10) < 2) { return; }
			var target = parseInt(m[2], 10);
			var start = null;
			el.setAttribute('aria-label', text.trim());
			var step = function (ts) {
				if (start === null) { start = ts; }
				var p = Math.min(1, (ts - start) / 1100);
				el.textContent = m[1] + Math.round(target * (1 - Math.pow(1 - p, 4))) + m[3];
				if (p < 1) { window.requestAnimationFrame(step); } else { el.textContent = text; }
			};
			window.requestAnimationFrame(step);
		};
		var cio = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } });
		}, { threshold: 0.6 });
		counters.forEach(function (el) { cio.observe(el); });
	}
})();
