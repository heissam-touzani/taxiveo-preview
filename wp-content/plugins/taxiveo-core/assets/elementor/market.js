/*!
 * TaxiVeo — marketplace véhicules (taxiveo-core, T-039).
 * Panneau de filtres coulissant, favoris, galerie, éditeur d'annonce et photos.
 * Toutes les écritures passent par l'API REST taxiveo/v1 (nonce wp_rest) ;
 * le serveur revérifie chaque droit et chaque valeur.
 */
( function () {
	'use strict';

	var cfg = window.taxiveoWidgets || { root: '', nonce: '' };
	var m = window.taxiveoMarket || { i18n: {}, codes: {}, labels: {}, mimes: [], maxBytes: 0 };
	var t = m.i18n || {};

	function api( method, path, body, isForm ) {
		var headers = { 'X-WP-Nonce': cfg.nonce };
		if ( body && ! isForm ) { headers[ 'Content-Type' ] = 'application/json'; }
		return fetch( cfg.root + path, {
			method: method,
			credentials: 'same-origin',
			headers: headers,
			body: body ? ( isForm ? body : JSON.stringify( body ) ) : undefined
		} ).then( function ( res ) {
			return res.json().catch( function () { return {}; } ).then( function ( data ) {
				return { ok: res.ok, status: res.status, data: data || {} };
			} );
		} );
	}

	function say( el, text, ok ) {
		if ( ! el ) { return; }
		el.textContent = text || '';
		el.classList.toggle( 'is-ok', ok === true );
		el.classList.toggle( 'is-error', ok === false );
	}

	function fmt( s ) {
		var args = Array.prototype.slice.call( arguments, 1 );
		var i = 0;
		return String( s ).replace( /%(\d\$)?d/g, function ( _, pos ) {
			return pos ? args[ parseInt( pos, 10 ) - 1 ] : args[ i++ ];
		} );
	}

	var live = document.createElement( 'p' );
	live.className = 'tv-sr';
	live.setAttribute( 'role', 'status' );
	live.setAttribute( 'aria-live', 'polite' );
	document.body.appendChild( live );

	/* ------------------------------------------------------------------
	 * Filtres : panneau coulissant sous 1025 px
	 * ------------------------------------------------------------------ */
	document.querySelectorAll( '[data-tv-vlist]' ).forEach( function ( root ) {
		var panel = root.querySelector( '[data-tv-filters]' );
		var scrim = root.querySelector( '[data-tv-scrim]' );
		var opener = root.querySelector( '[data-tv-filters-open]' );
		if ( ! panel || ! opener ) { return; }
		function setOpen( open ) {
			panel.classList.toggle( 'is-open', open );
			if ( scrim ) { scrim.classList.toggle( 'is-on', open ); }
			opener.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
			document.documentElement.classList.toggle( 'tv-noscroll', open );
			if ( open ) {
				panel.setAttribute( 'role', 'dialog' );
				panel.setAttribute( 'aria-modal', 'true' );
				var first = panel.querySelector( '.tv-filters__close' ) || panel.querySelector( 'input, select, button' );
				if ( first ) { first.focus(); }
			} else {
				panel.removeAttribute( 'role' );
				panel.removeAttribute( 'aria-modal' );
				opener.focus();
			}
		}
		opener.addEventListener( 'click', function () { setOpen( true ); } );
		root.querySelectorAll( '[data-tv-filters-close]' ).forEach( function ( b ) { b.addEventListener( 'click', function () { setOpen( false ); } ); } );
		if ( scrim ) { scrim.addEventListener( 'click', function () { setOpen( false ); } ); }
		document.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' && panel.classList.contains( 'is-open' ) ) { setOpen( false ); }
		} );
		root.querySelectorAll( '[data-tv-autosubmit]' ).forEach( function ( sel ) {
			sel.addEventListener( 'change', function () {
				var form = sel.form;
				if ( form ) { if ( form.requestSubmit ) { form.requestSubmit(); } else { form.submit(); } }
			} );
		} );
		// Champs vides non envoyés : URL de résultats propre.
		var form = root.querySelector( 'form' );
		if ( form ) {
			form.addEventListener( 'submit', function () {
				Array.prototype.forEach.call( form.elements, function ( el ) {
					if ( el.name && ( el.tagName === 'INPUT' || el.tagName === 'SELECT' ) && el.type !== 'checkbox' && el.value === '' ) { el.disabled = true; }
					if ( el.name === 'sort' && el.value === 'relevance' ) { el.disabled = true; }
					if ( el.name === 'radius' && el.value === '25' ) { el.disabled = true; }
				} );
			} );
		}
	} );

	/* ------------------------------------------------------------------
	 * v3 (T-046) : grille / liste mémorisée, squelettes pendant le chargement,
	 * panneau de filtres refermable par glissement vers le bas.
	 * ------------------------------------------------------------------ */
	function store( key, value ) {
		try {
			if ( value === undefined ) { return window.localStorage.getItem( key ); }
			window.localStorage.setItem( key, value );
		} catch ( e ) { return null; }
		return null;
	}
	document.querySelectorAll( '[data-tv-vlist]' ).forEach( function ( root ) {
		var toggle = root.querySelector( '[data-tv-view]' );
		var main = root.querySelector( '.tv-mk__main' );
		function setView( view ) {
			root.querySelectorAll( '.tv-results' ).forEach( function ( r ) { r.classList.toggle( 'tv-results--list', view === 'list' ); } );
			if ( toggle ) {
				toggle.querySelectorAll( '[data-view]' ).forEach( function ( b ) { b.setAttribute( 'aria-pressed', b.getAttribute( 'data-view' ) === view ? 'true' : 'false' ); } );
			}
		}
		if ( toggle ) {
			toggle.hidden = false;
			setView( store( 'tvVehView' ) === 'list' ? 'list' : 'grid' );
			toggle.addEventListener( 'click', function ( e ) {
				var b = e.target.closest( '[data-view]' );
				if ( ! b ) { return; }
				setView( b.getAttribute( 'data-view' ) );
				store( 'tvVehView', b.getAttribute( 'data-view' ) );
			} );
		}
		function loading() {
			if ( ! main || main.classList.contains( 'is-loading' ) ) { return; }
			main.classList.add( 'is-loading' );
			main.setAttribute( 'aria-busy', 'true' );
			var grid = document.createElement( 'div' );
			grid.className = 'tv-results tv-results--skeleton';
			grid.setAttribute( 'aria-hidden', 'true' );
			for ( var i = 0; i < 6; i++ ) {
				grid.insertAdjacentHTML( 'beforeend', '<div class="tv-skel-card"><div class="tv-skeleton tv-skel-card__media"></div><div class="tv-skel-card__body"><div class="tv-skeleton tv-skeleton--line" style="width:40%"></div><div class="tv-skeleton tv-skeleton--title"></div><div class="tv-skeleton tv-skeleton--line" style="width:75%"></div><div class="tv-skeleton tv-skeleton--line" style="width:50%;height:22px"></div></div></div>' );
			}
			var toolbar = main.querySelector( '.tv-toolbar' );
			if ( toolbar ) { toolbar.insertAdjacentElement( 'afterend', grid ); } else { main.prepend( grid ); }
		}
		var form = root.querySelector( 'form' );
		if ( form ) { form.addEventListener( 'submit', function () { window.setTimeout( loading, 60 ); } ); }
		root.addEventListener( 'click', function ( e ) {
			var a = e.target.closest( 'a[data-tv-loading], .tv-pager a, .tv-active a' );
			if ( a && ! e.metaKey && ! e.ctrlKey && ! e.shiftKey ) { loading(); }
		} );
		// Si l'utilisateur revient en arrière (bfcache), retirer les squelettes.
		window.addEventListener( 'pageshow', function () {
			if ( ! main ) { return; }
			main.classList.remove( 'is-loading' );
			main.removeAttribute( 'aria-busy' );
			main.querySelectorAll( '.tv-results--skeleton' ).forEach( function ( s ) { s.remove(); } );
		} );
		// Glisser vers le bas pour fermer le panneau de filtres (tactile).
		var panel = root.querySelector( '[data-tv-filters]' );
		var head = panel && panel.querySelector( '.tv-filters__head' );
		var closer = panel && panel.querySelector( '[data-tv-filters-close]' );
		if ( head && closer ) {
			var y0 = null;
			head.addEventListener( 'touchstart', function ( e ) { y0 = e.touches[ 0 ].clientY; }, { passive: true } );
			head.addEventListener( 'touchmove', function ( e ) {
				if ( y0 === null ) { return; }
				var dy = Math.max( 0, e.touches[ 0 ].clientY - y0 );
				panel.style.transform = 'translateY(' + dy + 'px)';
			}, { passive: true } );
			head.addEventListener( 'touchend', function ( e ) {
				if ( y0 === null ) { return; }
				var dy = e.changedTouches[ 0 ].clientY - y0;
				panel.style.transform = '';
				y0 = null;
				if ( dy > 80 ) { closer.click(); }
			} );
		}
	} );

	/* ------------------------------------------------------------------
	 * Favoris
	 * ------------------------------------------------------------------ */
	document.querySelectorAll( '[data-tv-fav]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			var id = btn.getAttribute( 'data-tv-fav' );
			var on = btn.getAttribute( 'aria-pressed' ) === 'true';
			btn.disabled = true;
			var req = on ? api( 'DELETE', 'me/favorites/vehicle/' + encodeURIComponent( id ) ) : api( 'POST', 'me/favorites', { object_type: 'vehicle', object_id: parseInt( id, 10 ) } );
			req.then( function ( r ) {
				btn.disabled = false;
				if ( r.status === 401 ) { window.location.assign( m.login ); return; }
				if ( ! r.ok && ! ( on && r.status === 404 ) ) { live.textContent = ( r.data && r.data.message ) || t.error; return; }
				var now = ! on;
				document.querySelectorAll( '[data-tv-fav="' + id + '"]' ).forEach( function ( b ) {
					b.setAttribute( 'aria-pressed', now ? 'true' : 'false' );
					b.setAttribute( 'aria-label', b.getAttribute( now ? 'data-label-remove' : 'data-label-add' ) );
				} );
				live.textContent = now ? t.favAdded : t.favRemoved;
				if ( btn.getAttribute( 'data-tv-fav-reload' ) ) { window.location.reload(); }
			} ).catch( function () { btn.disabled = false; live.textContent = t.error; } );
		} );
	} );

	/* ------------------------------------------------------------------
	 * Galerie de la fiche
	 * ------------------------------------------------------------------ */
	document.querySelectorAll( '[data-tv-gallery]' ).forEach( function ( g ) {
		var main = g.querySelector( '[data-tv-gallery-main]' );
		var count = g.querySelector( '[data-tv-gallery-count]' );
		var full = g.querySelector( '[data-tv-gallery-full]' );
		var thumbs = Array.prototype.slice.call( g.querySelectorAll( '[data-tv-gallery-thumb]' ) );
		if ( ! main ) { return; }
		var slides = thumbs.length ? thumbs.map( function ( th ) {
			return { src: th.getAttribute( 'data-src' ), srcset: th.getAttribute( 'data-srcset' ) || '', alt: th.getAttribute( 'data-alt' ) || '' };
		} ) : [ { src: main.currentSrc || main.src, srcset: main.getAttribute( 'srcset' ) || '', alt: main.alt } ];
		var index = 0;
		var box = null;
		var reduce = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
		function paint( img, s ) {
			img.src = s.src;
			if ( s.srcset ) { img.srcset = s.srcset; } else { img.removeAttribute( 'srcset' ); }
			img.alt = s.alt;
		}
		function show( i, dir ) {
			index = ( i + slides.length ) % slides.length;
			paint( main, slides[ index ] );
			if ( ! reduce && dir ) {
				main.classList.remove( 'is-swap-l', 'is-swap-r' );
				void main.offsetWidth; // relance l'animation
				main.classList.add( dir > 0 ? 'is-swap-r' : 'is-swap-l' );
			}
			thumbs.forEach( function ( x, k ) { if ( k === index ) { x.setAttribute( 'aria-current', 'true' ); } else { x.removeAttribute( 'aria-current' ); } } );
			if ( count ) { count.textContent = fmt( t.counter, index + 1, slides.length ); }
			if ( box && box.open ) { paint( box.querySelector( 'img' ), slides[ index ] ); box.querySelector( '.tv-lightbox__count' ).textContent = fmt( t.counter, index + 1, slides.length ); }
		}
		thumbs.forEach( function ( th, i ) {
			th.addEventListener( 'click', function ( e ) { e.preventDefault(); show( i, i > index ? 1 : -1 ); } );
		} );
		g.querySelectorAll( '[data-tv-gallery-step]' ).forEach( function ( b ) {
			b.addEventListener( 'click', function () { var s = parseInt( b.getAttribute( 'data-tv-gallery-step' ), 10 ); show( index + s, s ); } );
		} );
		g.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'ArrowRight' ) { show( index + 1, 1 ); }
			if ( e.key === 'ArrowLeft' ) { show( index - 1, -1 ); }
		} );
		function swipe( el ) {
			var x0 = null;
			el.addEventListener( 'touchstart', function ( e ) { x0 = e.touches[ 0 ].clientX; }, { passive: true } );
			el.addEventListener( 'touchend', function ( e ) {
				if ( x0 === null ) { return; }
				var dx = e.changedTouches[ 0 ].clientX - x0;
				if ( Math.abs( dx ) > 40 && slides.length > 1 ) { show( index + ( dx < 0 ? 1 : -1 ), dx < 0 ? 1 : -1 ); }
				x0 = null;
			} );
		}
		swipe( main );

		/* Plein écran : <dialog> natif (piège du focus et Échap fournis par le navigateur). */
		function lightbox() {
			if ( box ) { return box; }
			var prev = g.querySelector( '.tv-gallery__nav--prev' );
			var next = g.querySelector( '.tv-gallery__nav--next' );
			box = document.createElement( 'dialog' );
			box.className = 'tv-lightbox';
			box.setAttribute( 'aria-label', g.getAttribute( 'aria-label' ) || '' );
			box.innerHTML = '<div class="tv-lightbox__bar"><span class="tv-lightbox__count" aria-live="polite"></span><button type="button" class="tv-lightbox__btn" data-close></button></div><figure class="tv-lightbox__stage"><img alt=""></figure>' +
				( slides.length > 1 ? '<button type="button" class="tv-lightbox__btn tv-lightbox__nav tv-lightbox__nav--prev" data-step="-1"></button><button type="button" class="tv-lightbox__btn tv-lightbox__nav tv-lightbox__nav--next" data-step="1"></button>' : '' );
			var close = box.querySelector( '[data-close]' );
			close.setAttribute( 'aria-label', g.getAttribute( 'data-l-close' ) || 'Fermer' );
			close.innerHTML = '<svg class="tv-icon" aria-hidden="true"><use href="' + iconHref( 'close' ) + '"></use></svg>';
			box.querySelectorAll( '[data-step]' ).forEach( function ( b ) {
				var src = parseInt( b.getAttribute( 'data-step' ), 10 ) < 0 ? prev : next;
				b.setAttribute( 'aria-label', src ? src.getAttribute( 'aria-label' ) : '' );
				b.innerHTML = '<svg class="tv-icon" aria-hidden="true"><use href="' + iconHref( 'chevron' ) + '"></use></svg>';
				b.addEventListener( 'click', function () { var s = parseInt( b.getAttribute( 'data-step' ), 10 ); show( index + s, s ); } );
			} );
			close.addEventListener( 'click', function () { box.close(); } );
			box.addEventListener( 'click', function ( e ) { if ( e.target === box || e.target.classList.contains( 'tv-lightbox__stage' ) ) { box.close(); } } );
			box.addEventListener( 'keydown', function ( e ) {
				if ( e.key === 'ArrowRight' ) { show( index + 1, 1 ); }
				if ( e.key === 'ArrowLeft' ) { show( index - 1, -1 ); }
			} );
			box.addEventListener( 'close', function () { document.documentElement.classList.remove( 'tv-noscroll' ); if ( full ) { full.focus(); } } );
			swipe( box.querySelector( '.tv-lightbox__stage' ) );
			document.body.appendChild( box );
			return box;
		}
		function iconHref( name ) {
			var use = g.querySelector( 'use' ) || document.querySelector( 'use' );
			var href = use ? ( use.getAttribute( 'href' ) || '' ) : '';
			return href.replace( /#i-[a-z-]+$/, '#i-' + name );
		}
		function openBox() {
			if ( typeof HTMLDialogElement === 'undefined' ) { window.open( slides[ index ].src, '_blank', 'noopener' ); return; }
			var d = lightbox();
			paint( d.querySelector( 'img' ), slides[ index ] );
			d.querySelector( '.tv-lightbox__count' ).textContent = fmt( t.counter, index + 1, slides.length );
			d.showModal();
			document.documentElement.classList.add( 'tv-noscroll' );
		}
		if ( full ) { full.addEventListener( 'click', openBox ); }
		main.addEventListener( 'click', openBox );
		main.style.cursor = 'zoom-in';
	} );

	/* ------------------------------------------------------------------
	 * Éditeur d'annonce
	 * ------------------------------------------------------------------ */
	document.querySelectorAll( 'form[data-tv-vehicle]' ).forEach( function ( form ) {
		var status = form.querySelector( '.tv-veditor__foot .tv-form-status' );
		var missingEl = document.querySelector( '[data-tv-vmissing]' );
		var intent = 'save';
		var vid = function () { return parseInt( form.getAttribute( 'data-tv-vehicle' ), 10 ) || 0; };

		function field( name ) { return form.querySelector( '[name="' + name + '"]' ); }

		/* Affichages conditionnels. */
		function toggle( el, show ) {
			if ( ! el ) { return; }
			if ( show ) { el.removeAttribute( 'hidden' ); } else { el.setAttribute( 'hidden', '' ); }
		}
		function refresh() {
			var make = field( 'make' );
			var model = field( 'model' );
			var mk = make ? make.value : '';
			if ( model && ! model.disabled ) {
				model.querySelectorAll( 'optgroup' ).forEach( function ( og ) {
					var match = og.getAttribute( 'data-make' ) === mk;
					og.hidden = ! match;
					og.disabled = ! match;
				} );
				var opt = model.options[ model.selectedIndex ];
				if ( opt && opt.parentNode.tagName === 'OPTGROUP' && opt.parentNode.disabled ) { model.value = ''; }
			}
			toggle( form.querySelector( '[data-tv-show-make-other]' ), mk === 'other' );
			toggle( form.querySelector( '[data-tv-show-model-other]' ), mk === 'other' || ( model && model.value === 'other' ) );
			var fuel = field( 'fuel' );
			var ev = form.querySelector( '[data-tv-show-electrified]' );
			if ( ev ) { toggle( ev, !! fuel && ev.getAttribute( 'data-tv-show-electrified' ).split( ' ' ).indexOf( fuel.value ) !== -1 ); }
			form.querySelectorAll( '[data-tv-toggle]' ).forEach( function ( sel ) {
				toggle( form.querySelector( '[data-tv-show="' + sel.getAttribute( 'data-tv-toggle' ) + '"]' ), sel.value === '1' );
			} );
			var type = field( 'listing_type' );
			form.querySelectorAll( '[data-tv-show-type]' ).forEach( function ( el ) {
				toggle( el, ( type ? type.value : 'sale' ) === el.getAttribute( 'data-tv-show-type' ) );
			} );
		}
		form.addEventListener( 'change', refresh );
		refresh();

		/* Compteur de la description. */
		form.querySelectorAll( '[data-tv-counter]' ).forEach( function ( ta ) {
			var out = form.querySelector( '[data-tv-count-for="' + ta.name + '"]' );
			function upd() { if ( out ) { out.textContent = fmt( t.chars, ta.value.trim().length ); } }
			ta.addEventListener( 'input', upd );
			upd();
		} );

		/* Collecte des champs visibles et actifs. */
		var skip = [ 'seller_choice', 'accept_rules', 'certify_owner' ];
		function collect() {
			var body = {};
			var lists = {};
			Array.prototype.forEach.call( form.elements, function ( el ) {
				if ( ! el.name || el.disabled || skip.indexOf( el.name ) !== -1 ) { return; }
				if ( el.type === 'submit' || el.type === 'button' || el.type === 'file' ) { return; }
				if ( el.closest( '[hidden]' ) ) { return; }
				var type = el.getAttribute( 'data-tv-type' ) || '';
				if ( el.type === 'checkbox' && type === 'list' ) {
					lists[ el.name ] = lists[ el.name ] || [];
					if ( el.checked ) { lists[ el.name ].push( el.value ); }
					return;
				}
				if ( el.type === 'checkbox' ) { body[ el.name ] = el.checked; return; }
				var v = typeof el.value === 'string' ? el.value.trim() : el.value;
				if ( v === '' ) { return; }
				if ( type === 'int' ) { v = parseInt( v, 10 ); }
				if ( type === 'float' ) { v = parseFloat( v ); }
				if ( type === 'bool' ) { v = v === '1'; }
				body[ el.name ] = v;
			} );
			Object.keys( lists ).forEach( function ( k ) { body[ k ] = lists[ k ]; } );
			return body;
		}

		function clearErrors() {
			form.querySelectorAll( '[data-error-for]' ).forEach( function ( p ) { p.hidden = true; p.textContent = ''; } );
			form.querySelectorAll( '[aria-invalid="true"]' ).forEach( function ( el ) { el.removeAttribute( 'aria-invalid' ); } );
		}
		function codeText( code ) {
			return ( m.codes && m.codes[ code ] ) || ( /^tv_invalid/.test( code ) ? m.codes.tv_invalid : '' ) || code;
		}
		function showErrors( fields ) {
			var first = null;
			Object.keys( fields || {} ).forEach( function ( key ) {
				var p = form.querySelector( '[data-error-for="' + key + '"]' );
				if ( ! p ) { return; }
				p.textContent = codeText( fields[ key ] );
				p.hidden = false;
				var input = form.querySelector( '[name="' + key + '"]' ) || ( key === 'photos' ? form.querySelector( '[data-tv-photo-input]' ) : null );
				if ( input ) {
					input.setAttribute( 'aria-invalid', 'true' );
					if ( ! first ) { first = input; }
				}
			} );
			var target = first;
			if ( ! target ) { return; }
			var all = Array.prototype.slice.call( form.querySelectorAll( '[aria-invalid="true"]' ) );
			target = all[ 0 ] || target;
			if ( target.closest( '[hidden]' ) ) { return; }
			form.dispatchEvent( new CustomEvent( 'tv-vstep-goto', { detail: target } ) );
			target.focus();
		}
		function missingText( fields ) {
			var keys = Object.keys( fields || {} );
			if ( ! keys.length ) { return ''; }
			return t.missing + ' ' + keys.map( function ( k ) { return ( m.labels && m.labels[ k ] ) || k; } ).join( ', ' ) + '.';
		}
		function fail( r ) {
			if ( r && ( r.status === 401 || ( r.data && r.data.code === 'rest_cookie_invalid_nonce' ) ) ) { say( status, t.session, false ); return; }
			var fields = r && r.data && r.data.data && r.data.data.fields;
			if ( fields && ! Array.isArray( fields ) ) {
				showErrors( fields );
				say( status, t.fieldsError + ' ' + missingText( fields ), false );
				return;
			}
			say( status, ( r && r.data && r.data.message ) || t.error, false );
		}

		function setId( id ) {
			form.setAttribute( 'data-tv-vehicle', String( id ) );
			form.setAttribute( 'data-status', 'draft' );
			var seller = field( 'seller_choice' );
			if ( seller ) { seller.disabled = true; }
			var base = form.getAttribute( 'data-editor' );
			if ( base && window.history && window.history.replaceState ) {
				window.history.replaceState( null, '', base + ( base.indexOf( '?' ) === -1 ? '?' : '&' ) + 'vehicle=' + id );
			}
		}

		function create( body ) {
			var seller = field( 'seller_choice' );
			var choice = seller ? seller.value : 'private';
			if ( choice.indexOf( 'company:' ) === 0 ) {
				body.seller = 'company';
				body.company_id = parseInt( choice.split( ':' )[ 1 ], 10 );
			} else {
				body.seller = 'private';
			}
			return api( 'POST', 'me/vehicles', body ).then( function ( r ) {
				if ( r.ok && r.data && r.data.id ) { setId( r.data.id ); }
				return r;
			} );
		}

		function save() {
			var body = collect();
			return vid() ? api( 'PATCH', 'me/vehicles/' + vid(), body ) : create( body );
		}

		form.querySelectorAll( 'button[type="submit"]' ).forEach( function ( b ) {
			b.addEventListener( 'click', function () { intent = b.value || 'save'; } );
		} );

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors();
			if ( intent === 'publish' ) {
				var bad = {};
				[ 'accept_rules', 'certify_owner' ].forEach( function ( k ) { var c = field( k ); if ( c && ! c.checked ) { bad[ k ] = 'tv_required'; } } );
				if ( Object.keys( bad ).length ) { showErrors( bad ); say( status, t.declaration, false ); return; }
			}
			var buttons = form.querySelectorAll( 'button[type="submit"]' );
			buttons.forEach( function ( b ) { b.disabled = true; } );
			say( status, t.saving );
			save().then( function ( r ) {
				if ( ! r.ok ) { throw r; }
				if ( missingEl ) { missingEl.textContent = missingText( r.data.missing ); }
				if ( intent !== 'publish' ) { return { ok: true, draft: true, data: r.data }; }
				return api( 'POST', 'me/vehicles/' + vid() + '/submit' );
			} ).then( function ( r ) {
				if ( ! r.ok ) { throw r; }
				buttons.forEach( function ( b ) { b.disabled = false; } );
				if ( r.draft ) {
					say( status, form.getAttribute( 'data-status' ) === 'publish' ? t.saved : t.draftSaved, true );
					return;
				}
				say( status, r.data.status === 'publish' ? t.published : t.review, true );
				var target = form.getAttribute( 'data-redirect' );
				if ( target ) { window.setTimeout( function () { window.location.assign( target ); }, 900 ); }
			} ).catch( function ( r ) {
				buttons.forEach( function ( b ) { b.disabled = false; } );
				fail( r );
			} );
		} );

		/* ------------------------------------------------------------------
		 * v3 (T-046) : formulaire par étapes, validation en direct, aperçu.
		 * Les étapes masquées utilisent la classe is-off (jamais [hidden] :
		 * collect() ignore les champs sous [hidden]). Sans JS : formulaire complet.
		 * ------------------------------------------------------------------ */
		( function () {
			var steps = Array.prototype.slice.call( form.querySelectorAll( 'fieldset.tv-vstep' ) );
			var L = function ( k, d ) { return form.getAttribute( 'data-l-' + k ) || d; };
			if ( steps.length < 2 ) { return; }
			var cur = 0;
			var nav = document.createElement( 'ol' );
			nav.className = 'tv-stepper';
			steps.forEach( function ( st, i ) {
				var legend = st.querySelector( 'legend' );
				var name = legend ? legend.textContent.replace( /^\s*\d+\s*/, '' ).trim() : String( i + 1 );
				var li = document.createElement( 'li' );
				var b = document.createElement( 'button' );
				b.type = 'button';
				b.className = 'tv-stepper__btn';
				b.innerHTML = '<span class="tv-stepper__n">' + ( i + 1 ) + '</span><span class="tv-stepper__label"></span>';
				b.querySelector( '.tv-stepper__label' ).textContent = name;
				b.addEventListener( 'click', function () { go( i ); } );
				li.appendChild( b );
				nav.appendChild( li );
			} );
			var bar = document.createElement( 'div' );
			bar.className = 'tv-stepper__progress';
			bar.innerHTML = '<span></span>';
			var count = document.createElement( 'p' );
			count.className = 'tv-stepper__count';
			count.setAttribute( 'aria-live', 'polite' );
			var head = document.createElement( 'div' );
			head.className = 'tv-stepper__head';
			head.appendChild( count );
			head.appendChild( bar );
			head.appendChild( nav );
			form.insertBefore( head, steps[ 0 ] );

			var pager = document.createElement( 'div' );
			pager.className = 'tv-stepper__pager';
			pager.innerHTML = '<button type="button" class="tv-btn tv-btn--ghost" data-prev></button><button type="button" class="tv-btn tv-btn--primary" data-next></button>';
			var prevB = pager.querySelector( '[data-prev]' );
			var nextB = pager.querySelector( '[data-next]' );
			prevB.textContent = L( 'prev', 'Retour' );
			nextB.textContent = L( 'next', 'Continuer' );
			var foot = form.querySelector( '.tv-veditor__foot' );
			form.insertBefore( pager, foot || null );
			prevB.addEventListener( 'click', function () { go( cur - 1 ); } );
			nextB.addEventListener( 'click', function () {
				if ( validateStep( steps[ cur ] ) ) { go( cur + 1 ); }
			} );
			form.classList.add( 'is-stepped' );

			function go( i, noFocus ) {
				cur = Math.max( 0, Math.min( steps.length - 1, i ) );
				steps.forEach( function ( st, k ) { st.classList.toggle( 'is-off', k !== cur ); } );
				nav.querySelectorAll( '.tv-stepper__btn' ).forEach( function ( b, k ) {
					if ( k === cur ) { b.setAttribute( 'aria-current', 'step' ); } else { b.removeAttribute( 'aria-current' ); }
					b.classList.toggle( 'is-done', k < cur );
				} );
				bar.firstChild.style.transform = 'scaleX(' + ( ( cur + 1 ) / steps.length ) + ')';
				count.textContent = L( 'step', 'Étape %1$d sur %2$d' ).replace( '%1$d', cur + 1 ).replace( '%2$d', steps.length );
				prevB.hidden = cur === 0;
				nextB.hidden = cur === steps.length - 1;
				form.classList.toggle( 'is-last', cur === steps.length - 1 );
				if ( ! noFocus ) {
					var lg = steps[ cur ].querySelector( 'legend' );
					var top = head.getBoundingClientRect().top + window.pageYOffset - 100;
					if ( window.pageYOffset > top ) { window.scrollTo( { top: top, behavior: 'smooth' } ); }
					if ( lg ) { lg.setAttribute( 'tabindex', '-1' ); lg.focus( { preventScroll: true } ); }
				}
			}
			form.addEventListener( 'tv-vstep-goto', function ( e ) {
				var st = e.detail && e.detail.closest ? e.detail.closest( 'fieldset.tv-vstep' ) : null;
				var i = steps.indexOf( st );
				if ( i >= 0 && i !== cur ) { go( i, true ); }
			} );

			/* Validation en direct (contraintes HTML : required, min, max, pattern, longueurs). */
			function visible( el ) { return ! el.closest( '[hidden]' ) && ! el.disabled; }
			function errFor( el ) { return form.querySelector( '[data-error-for="' + el.name + '"]' ); }
			function check( el, show ) {
				if ( ! el.name || ! el.willValidate || ! visible( el ) || el.type === 'file' ) { return true; }
				var ok = el.checkValidity();
				var p = errFor( el );
				if ( ok ) {
					if ( el.getAttribute( 'aria-invalid' ) === 'true' && el.getAttribute( 'data-live-invalid' ) ) {
						el.removeAttribute( 'aria-invalid' );
						el.removeAttribute( 'data-live-invalid' );
						if ( p ) { p.hidden = true; p.textContent = ''; }
					}
					el.classList.toggle( 'is-valid', el.value !== '' && el.type !== 'checkbox' );
				} else if ( show ) {
					el.setAttribute( 'aria-invalid', 'true' );
					el.setAttribute( 'data-live-invalid', '1' );
					el.classList.remove( 'is-valid' );
					if ( p ) { p.textContent = el.validity.valueMissing ? L( 'required', 'Ce champ est obligatoire.' ) : ( el.validationMessage || L( 'invalid', 'Vérifiez cette valeur.' ) ); p.hidden = false; }
				}
				return ok;
			}
			form.addEventListener( 'focusout', function ( e ) {
				if ( e.target.matches && e.target.matches( 'input, select, textarea' ) ) { check( e.target, true ); }
			} );
			form.addEventListener( 'input', function ( e ) {
				if ( e.target.getAttribute && e.target.getAttribute( 'aria-invalid' ) === 'true' ) { check( e.target, true ); }
			} );
			function validateStep( st ) {
				var first = null;
				st.querySelectorAll( 'input, select, textarea' ).forEach( function ( el ) {
					if ( ! check( el, true ) && ! first ) { first = el; }
				} );
				if ( first ) { first.focus(); return false; }
				return true;
			}

			/* Aperçu en direct de la carte d'annonce. */
			var aside = document.createElement( 'aside' );
			aside.className = 'tv-vpreview';
			aside.setAttribute( 'aria-label', L( 'preview', 'Aperçu' ) );
			aside.innerHTML = '<p class="tv-vpreview__label"></p><div class="tv-vpreview__card"><div class="tv-vpreview__media"></div><div class="tv-vpreview__body"><p class="tv-vpreview__kicker"></p><p class="tv-vpreview__title"></p><p class="tv-vpreview__specs"></p><p class="tv-vpreview__price"></p></div></div><p class="tv-help"></p>';
			aside.querySelector( '.tv-vpreview__label' ).textContent = L( 'preview', 'Aperçu' );
			aside.querySelector( '.tv-help' ).textContent = L( 'preview-note', '' );
			var wrap = form.closest( '.tv-veditor' ) || form.parentNode;
			wrap.classList.add( 'has-preview' );
			wrap.appendChild( aside );
			function text( name ) {
				var el = field( name );
				if ( ! el || el.closest( '[hidden]' ) || el.type === 'radio' ) { return ''; }
				if ( el.tagName === 'SELECT' ) { return el.value ? el.options[ el.selectedIndex ].text.trim() : ''; }
				return ( el.value || '' ).trim();
			}
			function paint() {
				var make = text( 'make' ) === '' ? '' : ( text( 'make_other' ) || text( 'make' ) );
				var model = text( 'model_other' ) || text( 'model' );
				var title = [ make, model, text( 'version' ), text( 'year' ) ].filter( Boolean ).join( ' ' );
				aside.querySelector( '.tv-vpreview__title' ).textContent = title || L( 'untitled', 'Votre véhicule' );
				aside.querySelector( '.tv-vpreview__kicker' ).textContent = text( 'listing_type' );
				var km = text( 'mileage_km' );
				aside.querySelector( '.tv-vpreview__specs' ).textContent = [ text( 'year' ), km ? Number( km ).toLocaleString( document.documentElement.lang || 'fr' ) + ' km' : '', text( 'fuel' ) ].filter( Boolean ).join( ' · ' );
				var price = text( 'price_eur' ) || text( 'rental_price_eur' );
				aside.querySelector( '.tv-vpreview__price' ).textContent = price ? Number( price ).toLocaleString( document.documentElement.lang || 'fr' ) + ' €' : L( 'noprice', '' );
				var img = form.querySelector( '[data-tv-photo-list] li img' );
				var media = aside.querySelector( '.tv-vpreview__media' );
				var src = img ? img.getAttribute( 'src' ) : '';
				if ( src && ( ! media.firstChild || media.firstChild.getAttribute( 'src' ) !== src ) ) {
					media.innerHTML = '';
					var im = document.createElement( 'img' );
					im.alt = '';
					im.src = src;
					media.appendChild( im );
				} else if ( ! src ) { media.innerHTML = ''; }
			}
			form.addEventListener( 'input', paint );
			form.addEventListener( 'change', paint );
			form.addEventListener( 'tv-photos-changed', paint );
			var plist = form.querySelector( '[data-tv-photo-list]' );
			if ( plist && window.MutationObserver ) { new MutationObserver( paint ).observe( plist, { childList: true } ); }
			paint();
			go( 0, true );
		}() );

		/* Photos : envoi une à une, ordre, suppression. */
		var box = form.querySelector( '[data-tv-photos]' );
		if ( ! box ) { return; }
		var list = box.querySelector( '[data-tv-photo-list]' );
		var input = box.querySelector( '[data-tv-photo-input]' );
		var errors = box.querySelector( '[data-tv-photo-errors]' );
		var max = parseInt( box.getAttribute( 'data-max' ), 10 ) || 8;

		function err( name, text ) {
			var li = document.createElement( 'li' );
			li.className = 'tv-error';
			li.textContent = ( name ? name + ' : ' : '' ) + text;
			errors.appendChild( li );
		}
		function ids() {
			return Array.prototype.map.call( list.querySelectorAll( 'li[data-photo-id]' ), function ( li ) { return parseInt( li.getAttribute( 'data-photo-id' ), 10 ); } );
		}
		function tool( label, attr, value, text ) {
			var b = document.createElement( 'button' );
			b.type = 'button';
			b.className = 'tv-iconbtn';
			b.setAttribute( attr, value );
			b.setAttribute( 'aria-label', label );
			b.textContent = text;
			return b;
		}
		function item( src ) {
			var li = document.createElement( 'li' );
			li.className = 'tv-photo is-uploading';
			var img = document.createElement( 'img' );
			img.src = src;
			img.alt = '';
			li.appendChild( img );
			var cover = document.createElement( 'span' );
			cover.className = 'tv-badge tv-badge--premium tv-photo__cover';
			cover.textContent = t.cover;
			li.appendChild( cover );
			var tools = document.createElement( 'div' );
			tools.className = 'tv-photo__tools';
			tools.appendChild( tool( t.moveUp, 'data-tv-photo-move', '-1', '↑' ) );
			tools.appendChild( tool( t.moveDown, 'data-tv-photo-move', '1', '↓' ) );
			tools.appendChild( tool( t.remove, 'data-tv-photo-delete', '', '×' ) );
			li.appendChild( tools );
			return li;
		}
		function ensureId() {
			if ( vid() ) { return Promise.resolve( true ); }
			say( status, t.draftFirst );
			return create( collect() ).then( function ( r ) {
				if ( ! r.ok ) { fail( r ); return false; }
				say( status, t.draftSaved, true );
				return true;
			} );
		}
		function upload( files ) {
			var chain = Promise.resolve();
			files.forEach( function ( file ) {
				chain = chain.then( function () {
					var url = window.URL ? window.URL.createObjectURL( file ) : '';
					var li = item( url );
					list.appendChild( li );
					live.textContent = t.uploading;
					var fd = new FormData();
					fd.append( 'file', file, file.name );
					return api( 'POST', 'me/vehicles/' + vid() + '/photos', fd, true ).then( function ( r ) {
						if ( ! r.ok ) {
							li.remove();
							err( file.name, ( r.data && r.data.message ) || t.error );
							return;
						}
						li.classList.remove( 'is-uploading' );
						li.setAttribute( 'data-photo-id', String( r.data.id ) );
						live.textContent = t.uploaded;
					} );
				} );
			} );
			return chain;
		}
		/* v3 : glisser-déposer sur la zone de dépôt (mêmes contrôles que le sélecteur). */
		var drop = box.querySelector( '[data-tv-dropzone]' );
		if ( drop ) {
			[ 'dragenter', 'dragover' ].forEach( function ( ev ) {
				drop.addEventListener( ev, function ( e ) { e.preventDefault(); drop.classList.add( 'is-over' ); } );
			} );
			[ 'dragleave', 'drop' ].forEach( function ( ev ) {
				drop.addEventListener( ev, function ( e ) { e.preventDefault(); drop.classList.remove( 'is-over' ); } );
			} );
			drop.addEventListener( 'drop', function ( e ) {
				var dt = e.dataTransfer;
				if ( dt && dt.files && dt.files.length ) { handle( Array.prototype.slice.call( dt.files ) ); }
			} );
		}
		input.addEventListener( 'change', function () {
			handle( Array.prototype.slice.call( input.files || [] ) );
		} );
		function handle( files ) {
			errors.textContent = '';
			var room = max - list.querySelectorAll( 'li' ).length;
			var ok = [];
			files.forEach( function ( f ) {
				if ( m.mimes.indexOf( f.type ) === -1 ) { err( f.name, t.badType ); return; }
				if ( f.size > m.maxBytes ) { err( f.name, t.tooBig ); return; }
				if ( ok.length >= room ) { err( f.name, t.tooMany ); return; }
				ok.push( f );
			} );
			input.value = '';
			if ( ! ok.length ) { return; }
			ensureId().then( function ( ready ) { if ( ready ) { return upload( ok ); } } ).then( function () { form.dispatchEvent( new Event( 'tv-photos-changed' ) ); } );
		}
		list.addEventListener( 'click', function ( e ) {
			var btn = e.target.closest( 'button' );
			if ( ! btn ) { return; }
			var li = btn.closest( 'li' );
			var pid = li && li.getAttribute( 'data-photo-id' );
			if ( ! pid ) { return; }
			if ( btn.hasAttribute( 'data-tv-photo-delete' ) ) {
				if ( ! window.confirm( t.deleteConfirm ) ) { return; }
				btn.disabled = true;
				api( 'DELETE', 'me/vehicles/' + vid() + '/photos/' + pid ).then( function ( r ) {
					if ( ! r.ok ) { btn.disabled = false; err( '', ( r.data && r.data.message ) || t.error ); return; }
					li.remove();
				} );
				return;
			}
			var step = parseInt( btn.getAttribute( 'data-tv-photo-move' ), 10 );
			var sibling = step < 0 ? li.previousElementSibling : li.nextElementSibling;
			if ( ! sibling ) { return; }
			if ( step < 0 ) { list.insertBefore( li, sibling ); } else { list.insertBefore( sibling, li ); }
			btn.focus();
			api( 'PUT', 'me/vehicles/' + vid() + '/photos/order', { ids: ids() } ).then( function ( r ) {
				if ( ! r.ok ) { err( '', ( r.data && r.data.message ) || t.error ); }
			} );
		} );
	} );
}() );
