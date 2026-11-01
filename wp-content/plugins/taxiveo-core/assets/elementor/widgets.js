/*!
 * TaxiVeo — interactions des widgets (taxiveo-core, T-034).
 * Filtres repliables sur mobile, envoi de candidature et Passeport par l'API
 * REST taxiveo/v1 (nonce wp_rest). Le serveur revérifie tous les droits.
 */
( function () {
	'use strict';

	var cfg = window.taxiveoWidgets || { root: '', nonce: '', i18n: {} };
	var t = cfg.i18n || {};

	function api( method, path, body ) {
		return fetch( cfg.root + path, {
			method: method,
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
			body: body ? JSON.stringify( body ) : undefined
		} ).then( function ( res ) {
			return res.json().catch( function () { return {}; } ).then( function ( data ) {
				return { ok: res.ok, status: res.status, data: data || {} };
			} );
		} );
	}

	function setStatus( el, text, ok ) {
		if ( ! el ) { return; }
		el.textContent = text || '';
		el.classList.toggle( 'is-ok', !! ok );
		el.classList.toggle( 'is-error', ok === false );
	}

	/* Filtres des offres : panneau repliable sous 1025 px. */
	document.querySelectorAll( '[data-tv-joblist] .tv-filter-toggle' ).forEach( function ( btn ) {
		var panel = document.getElementById( btn.getAttribute( 'aria-controls' ) );
		if ( ! panel ) { return; }
		btn.addEventListener( 'click', function () {
			var open = btn.getAttribute( 'aria-expanded' ) !== 'true';
			btn.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
			panel.classList.toggle( 'is-open', open );
			if ( open ) {
				var first = panel.querySelector( 'input, select, button' );
				if ( first ) { first.focus(); }
			}
		} );
	} );

	/* Candidature. */
	document.querySelectorAll( '[data-tv-apply]' ).forEach( function ( form ) {
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			var status = form.querySelector( '.tv-form-status' );
			var answers = [];
			var missing = false;
			form.querySelectorAll( 'textarea[name="answers[]"]' ).forEach( function ( a ) {
				var v = a.value.trim();
				a.setAttribute( 'aria-invalid', a.required && ! v ? 'true' : 'false' );
				if ( a.required && ! v ) { missing = true; }
				answers.push( v );
			} );
			if ( missing ) { setStatus( status, t.required, false ); return; }
			var button = form.querySelector( 'button[type="submit"]' );
			button.disabled = true;
			setStatus( status, t.sending );
			api( 'POST', 'jobs/' + encodeURIComponent( form.getAttribute( 'data-job' ) ) + '/applications', {
				message: form.querySelector( 'textarea[name="message"]' ).value.trim(),
				answers: answers
			} ).then( function ( r ) {
				if ( r.ok ) {
					setStatus( status, t.applied, true );
					form.querySelectorAll( 'textarea, button' ).forEach( function ( el ) { el.disabled = true; } );
					if ( cfg.links && cfg.links.myApplications ) {
						var link = document.createElement( 'a' );
						link.className = 'tv-btn tv-btn--secondary tv-btn--block';
						link.href = cfg.links.myApplications;
						link.textContent = t.seeApplications;
						form.appendChild( link );
					}
					return;
				}
				button.disabled = false;
				setStatus( status, r.data.message || t.error, false );
			} ).catch( function () {
				button.disabled = false;
				setStatus( status, t.error, false );
			} );
		} );
	} );

	/* Mon Passeport. */
	document.querySelectorAll( '[data-tv-mypp]' ).forEach( function ( root ) {
		var form = root.querySelector( 'form' );
		var status = form.querySelector( '.tv-form-status' );
		var exists = root.getAttribute( 'data-exists' ) === '1';

		function checked( name ) {
			return Array.prototype.map.call( form.querySelectorAll( 'input[name="' + name + '"]:checked' ), function ( i ) { return i.value; } );
		}
		function value( name ) {
			var el = form.querySelector( '[name="' + name + '"]' );
			return el ? el.value.trim() : '';
		}
		function collect() {
			var body = {};
			var regions = checked( 'regions' ).map( Number );
			if ( regions.length ) { body.regions = regions; }
			if ( value( 'experience_years' ) !== '' ) { body.experience_years = parseInt( value( 'experience_years' ), 10 ); }
			var langs = [];
			form.querySelectorAll( 'select[name="language"]' ).forEach( function ( s ) {
				if ( s.value ) { langs.push( { term_id: Number( s.getAttribute( 'data-term' ) ), level: s.value } ); }
			} );
			if ( langs.length ) { body.languages = langs; }
			if ( form.querySelector( 'input[name="activity_types"]' ) ) { body.activity_types = checked( 'activity_types' ).map( Number ); }
			body.opportunities = checked( 'opportunities' );
			if ( value( 'availability_status' ) ) { body.availability_status = value( 'availability_status' ); }
			if ( value( 'availability_status' ) === 'from' && value( 'available_from' ) ) { body.available_from = value( 'available_from' ); }
			if ( value( 'pro_status' ) ) { body.pro_status = value( 'pro_status' ); }
			body.presentation = value( 'presentation' );
			if ( value( 'lang' ) ) { body.lang = value( 'lang' ); }
			var vis = checked( 'visibility' );
			if ( vis.length ) { body.visibility = vis[ 0 ]; }
			return body;
		}
		function clearErrors() {
			form.querySelectorAll( '[data-error-for]' ).forEach( function ( p ) { p.hidden = true; p.textContent = ''; } );
			form.querySelectorAll( '[aria-invalid="true"]' ).forEach( function ( el ) { el.removeAttribute( 'aria-invalid' ); } );
		}
		function showErrors( fields ) {
			var first = null;
			Object.keys( fields || {} ).forEach( function ( key ) {
				var p = form.querySelector( '[data-error-for="' + key + '"]' );
				if ( ! p ) { return; }
				p.textContent = ( t.codes && t.codes[ fields[ key ] ] ) || t.codes.tv_invalid;
				p.hidden = false;
				var input = form.querySelector( '[name="' + key + '"]' );
				if ( input ) {
					input.setAttribute( 'aria-invalid', 'true' );
					if ( ! first ) { first = input; }
				}
			} );
			if ( first ) { first.focus(); }
		}
		function updateState( data ) {
			var missingEl = root.querySelector( '[data-tv-pp-missing]' );
			if ( missingEl ) {
				var list = ( data.missing || [] ).map( function ( m ) { return ( t.fieldLabels && t.fieldLabels[ m ] ) || m; } );
				missingEl.textContent = list.length ? t.missing + ' ' + list.join( ', ' ) + '.' : '';
			}
		}

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors();
			var button = form.querySelector( 'button[type="submit"]' );
			button.disabled = true;
			setStatus( status, t.saving );
			api( exists ? 'PATCH' : 'POST', 'me/passport', collect() ).then( function ( r ) {
				button.disabled = false;
				if ( r.ok ) {
					if ( ! exists ) {
						setStatus( status, t.created, true );
						window.location.reload();
						return;
					}
					setStatus( status, t.saved, true );
					updateState( r.data );
					return;
				}
				setStatus( status, r.data.data && r.data.data.fields ? t.fieldsError : ( r.data.message || t.error ), false );
				if ( r.data.data && r.data.data.fields ) { showErrors( r.data.data.fields ); }
			} ).catch( function () {
				button.disabled = false;
				setStatus( status, t.error, false );
			} );
		} );

		root.querySelectorAll( '[data-tv-pp-transition]' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				btn.disabled = true;
				setStatus( status, t.saving );
				api( 'POST', 'me/passport/transitions', { to: btn.getAttribute( 'data-tv-pp-transition' ) } ).then( function ( r ) {
					if ( r.ok ) { window.location.reload(); return; }
					btn.disabled = false;
					var msg = r.data.message || t.error;
					if ( r.data.data && r.data.data.missing ) { updateState( { missing: r.data.data.missing } ); }
					setStatus( status, msg, false );
				} ).catch( function () {
					btn.disabled = false;
					setStatus( status, t.error, false );
				} );
			} );
		} );
	} );

	/* ------------------------------------------------------------------
	 * v3 (T-046) : recherche unifiée du Hero (l'onglet choisit la page
	 * de destination), barres collantes « Contacter » / « Postuler »,
	 * bouton Partager. Amélioration progressive : sans JS, tout fonctionne.
	 * ------------------------------------------------------------------ */
	document.querySelectorAll( '[data-tv-usearch]' ).forEach( function ( form ) {
		var tabs = Array.prototype.slice.call( form.querySelectorAll( '.tv-search__tab[data-url]' ) );
		var q = form.querySelector( '[data-tv-usearch-q]' );
		var region = form.querySelector( '[data-tv-usearch-region]' );
		var place = form.querySelector( '[data-tv-usearch-place]' );
		var ink = form.querySelector( '.tv-search__ink' );
		function moveInk( tab ) {
			if ( ! ink || ! tab ) { return; }
			ink.style.width = tab.offsetWidth + 'px';
			ink.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
			ink.classList.add( 'is-on' );
		}
		function setPart( el, on ) {
			if ( ! el ) { return; }
			el.hidden = ! on;
			el.querySelectorAll( 'input, select' ).forEach( function ( f ) { f.disabled = ! on; } );
		}
		function pick( tab, focus ) {
			tabs.forEach( function ( x ) { x.setAttribute( 'aria-pressed', x === tab ? 'true' : 'false' ); } );
			form.action = tab.getAttribute( 'data-url' );
			if ( q ) { q.name = 'q'; q.placeholder = tab.getAttribute( 'data-ph' ) || ''; }
			setPart( region, tab.getAttribute( 'data-region' ) === '1' );
			setPart( place, tab.getAttribute( 'data-place' ) === '1' );
			form.setAttribute( 'data-scope', tab.getAttribute( 'data-scope' ) || '' );
			moveInk( tab );
			if ( focus && q ) { q.focus(); }
		}
		tabs.forEach( function ( tab ) { tab.addEventListener( 'click', function () { pick( tab, true ); } ); } );
		var current = form.querySelector( '.tv-search__tab[aria-pressed="true"]' ) || tabs[ 0 ];
		if ( current ) { pick( current, false ); }
		window.addEventListener( 'resize', function () { moveInk( form.querySelector( '.tv-search__tab[aria-pressed="true"]' ) ); } );
		form.addEventListener( 'submit', function () {
			Array.prototype.forEach.call( form.elements, function ( el ) {
				if ( el.name && ( el.tagName === 'INPUT' || el.tagName === 'SELECT' ) && el.value === '' ) { el.disabled = true; }
			} );
		} );
		window.addEventListener( 'pageshow', function () {
			Array.prototype.forEach.call( form.elements, function ( el ) { if ( ! el.closest( '[hidden]' ) ) { el.disabled = false; } } );
		} );
	} );

	document.querySelectorAll( '[data-tv-sticky]' ).forEach( function ( bar ) {
		var target = document.getElementById( bar.getAttribute( 'data-tv-sticky' ) );
		if ( ! target || ! ( 'IntersectionObserver' in window ) ) { return; }
		var visible = true;
		var deep = false;
		function update() {
			var on = ! visible && deep;
			bar.classList.toggle( 'is-on', on );
			bar.setAttribute( 'aria-hidden', on ? 'false' : 'true' );
			bar.querySelectorAll( 'a, button' ).forEach( function ( a ) { a.tabIndex = on ? 0 : -1; } );
			document.documentElement.classList.toggle( 'tv-has-sticky', on );
		}
		new IntersectionObserver( function ( entries ) {
			visible = entries[ 0 ].isIntersecting;
			update();
		}, { rootMargin: '0px 0px -10% 0px' } ).observe( target );
		window.addEventListener( 'scroll', function () {
			var d = window.pageYOffset > 420;
			if ( d !== deep ) { deep = d; update(); }
		}, { passive: true } );
	} );

	document.querySelectorAll( '[data-tv-share]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var url = btn.getAttribute( 'data-url' ) || window.location.href;
			var title = btn.getAttribute( 'data-title' ) || document.title;
			if ( navigator.share ) {
				navigator.share( { title: title, url: url } ).catch( function () {} );
				return;
			}
			var done = function () {
				var label = btn.querySelector( 'span' );
				if ( ! label ) { return; }
				var old = label.textContent;
				label.textContent = btn.getAttribute( 'data-done' ) || old;
				btn.classList.add( 'is-done' );
				window.setTimeout( function () { label.textContent = old; btn.classList.remove( 'is-done' ); }, 2200 );
			};
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( url ).then( done, function () { window.prompt( title, url ); } );
			} else {
				window.prompt( title, url );
			}
		} );
	} );

	/* Scène du Hero : parallaxe légère au pointeur (pointeurs fins, mouvement autorisé). */
	( function () {
		var hero = document.querySelector( "[data-tv-hero]" );
		var scene = hero && hero.querySelector( ".tv-scene" );
		var mm = window.matchMedia;
		if ( ! scene || ! mm || mm( "(prefers-reduced-motion: reduce)" ).matches || ! mm( "(hover: hover) and (pointer: fine)" ).matches ) { return; }
		var raf = 0;
		hero.addEventListener( "pointermove", function ( e ) {
			if ( raf ) { return; }
			raf = window.requestAnimationFrame( function () {
				raf = 0;
				var r = hero.getBoundingClientRect();
				scene.style.setProperty( "--px", ( ( e.clientX - r.left ) / r.width - 0.5 ).toFixed( 3 ) );
				scene.style.setProperty( "--py", ( ( e.clientY - r.top ) / r.height - 0.5 ).toFixed( 3 ) );
			} );
		}, { passive: true } );
		hero.addEventListener( "pointerleave", function () { scene.style.setProperty( "--px", 0 ); scene.style.setProperty( "--py", 0 ); } );
	}() );
}() );
