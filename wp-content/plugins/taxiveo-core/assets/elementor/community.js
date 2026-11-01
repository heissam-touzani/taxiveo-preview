/*!
 * TaxiVeo — Actualités et communauté (taxiveo-core, T-044).
 * Signalement (visiteur ou membre), partage, ajout à l'agenda (.ics), « Afficher plus »,
 * filtres envoyés au changement, publication d'une actualité.
 * Toute écriture passe par l'API taxiveo/v1, qui revérifie les droits.
 */
( function () {
	'use strict';

	var cfg = window.taxiveoWidgets || { root: '', nonce: '', i18n: {} };
	var base = cfg.i18n || {};
	var t = window.taxiveoCommunity || {};
	var codes = Object.assign( {}, base.codes || {}, ( window.taxiveoSpace || {} ).codes || {}, t.codes || {} );

	function api( method, path, body ) {
		var headers = { 'Content-Type': 'application/json' };
		if ( cfg.nonce ) { headers[ 'X-WP-Nonce' ] = cfg.nonce; }
		return fetch( cfg.root + path, {
			method: method,
			credentials: 'same-origin',
			headers: headers,
			body: body ? JSON.stringify( body ) : undefined
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

	function clearErrors( form ) {
		form.querySelectorAll( '[data-error-for]' ).forEach( function ( p ) { p.hidden = true; p.textContent = ''; } );
		form.querySelectorAll( '[aria-invalid="true"]' ).forEach( function ( el ) { el.removeAttribute( 'aria-invalid' ); } );
	}

	function showErrors( form, fields ) {
		Object.keys( fields || {} ).forEach( function ( key ) {
			var p = form.querySelector( '[data-error-for="' + key + '"]' );
			if ( ! p ) { return; }
			p.textContent = codes[ fields[ key ] ] || codes.tv_invalid || fields[ key ];
			p.hidden = false;
			var input = form.querySelector( '[name="' + key + '"]' );
			if ( input ) { input.setAttribute( 'aria-invalid', 'true' ); }
		} );
		var first = form.querySelector( '[aria-invalid="true"]' );
		if ( first ) { first.focus(); }
	}

	function fail( form, status, r ) {
		var d = r.data || {};
		say( status, d.message || base.error, false );
		if ( d.data && d.data.fields && ! Array.isArray( d.data.fields ) ) { showErrors( form, d.data.fields ); }
	}

	/* Signalement (M1 § 0 bis) : visiteur ou membre. */
	document.querySelectorAll( 'form[data-tv-report]' ).forEach( function ( form ) {
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors( form );
			var status = form.querySelector( '.tv-form-status' );
			var visitor = form.getAttribute( 'data-visitor' ) === '1';
			var body = JSON.parse( form.getAttribute( 'data-extra' ) || '{}' );
			var reason = form.querySelector( '[name="reason"]' );
			var comment = form.querySelector( '[name="comment"]' );
			body.reason = reason ? reason.value : '';
			if ( comment && comment.value.trim() ) { body.comment = comment.value.trim(); }
			if ( visitor ) {
				var email = form.querySelector( '[name="email"]' );
				var faith = form.querySelector( '[name="good_faith"]' );
				var token = form.querySelector( '[name="turnstile_token"]' );
				if ( email && email.value.trim() ) { body.email = email.value.trim(); }
				body.good_faith = !! ( faith && faith.checked );
				if ( ! body.good_faith ) { showErrors( form, { good_faith: 'tv_required' } ); say( status, t.goodFaith, false ); return; }
				if ( form.querySelector( '.cf-turnstile' ) && ! ( token && token.value ) ) { say( status, t.captcha, false ); return; }
				if ( token ) { body.turnstile_token = token.value; }
			}
			var button = form.querySelector( 'button[type="submit"]' );
			button.disabled = true;
			say( status, base.sending );
			api( 'POST', 'reports', body ).then( function ( r ) {
				button.disabled = false;
				if ( ! r.ok ) {
					fail( form, status, r );
					if ( window.turnstile && form.querySelector( '.cf-turnstile' ) ) { try { window.turnstile.reset( form.querySelector( '.cf-turnstile' ) ); } catch ( err ) {} }
					return;
				}
				var done = form.parentNode.querySelector( '.tv-report__done' );
				var msg = t.reportOk;
				if ( r.data && r.data.tracking_token ) { msg += ' ' + ( t.reportToken || '%s' ).replace( '%s', r.data.tracking_token ); }
				if ( body.email ) { msg += ' ' + t.reportMail; }
				form.hidden = true;
				if ( done ) {
					done.querySelector( '[data-tv-report-msg]' ).textContent = msg;
					done.hidden = false;
					done.focus();
				}
			} ).catch( function () {
				button.disabled = false;
				say( status, base.error, false );
			} );
		} );
	} );

	/* Partage : natif si disponible, sinon copie du lien. */
	document.querySelectorAll( '[data-tv-share]' ).forEach( function ( box ) {
		var btn = box.querySelector( '[data-tv-share-btn]' );
		var status = box.querySelector( '.tv-share__status' );
		var url = box.getAttribute( 'data-url' );
		var title = box.getAttribute( 'data-title' );
		if ( ! btn ) { return; }
		btn.addEventListener( 'click', function () {
			if ( navigator.share ) {
				navigator.share( { title: title, url: url } ).catch( function () {} );
				return;
			}
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( url ).then( function () { say( status, t.copied, true ); }, function () { say( status, t.copyFail, false ); } );
			} else {
				say( status, t.copyFail, false );
			}
		} );
	} );

	/* Ajouter à mon agenda : fichier .ics généré localement (aucun service tiers). */
	function icsDate( iso ) {
		return new Date( iso ).toISOString().replace( /[-:]/g, '' ).replace( /\.\d{3}/, '' );
	}
	function icsText( s ) {
		return String( s || '' ).replace( /\\/g, '\\\\' ).replace( /;/g, '\\;' ).replace( /,/g, '\\,' ).replace( /\n/g, '\\n' );
	}
	document.querySelectorAll( '[data-tv-ics]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var ev = JSON.parse( btn.getAttribute( 'data-tv-ics' ) || '{}' );
			var lines = [
				'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaxiVeo//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
				'BEGIN:VEVENT',
				'UID:' + ev.uid,
				'DTSTAMP:' + icsDate( new Date().toISOString() ),
				'DTSTART:' + icsDate( ev.start ),
				'DTEND:' + icsDate( ev.end ),
				'SUMMARY:' + icsText( ev.title ),
				'LOCATION:' + icsText( ev.location ),
				'URL:' + ev.url,
				'END:VEVENT', 'END:VCALENDAR'
			];
			var blob = new Blob( [ lines.join( '\r\n' ) ], { type: 'text/calendar;charset=utf-8' } );
			var a = document.createElement( 'a' );
			a.href = URL.createObjectURL( blob );
			a.download = 'taxiveo-evenement.ics';
			document.body.appendChild( a );
			a.click();
			window.setTimeout( function () { URL.revokeObjectURL( a.href ); a.remove(); }, 500 );
		} );
	} );

	/* « Afficher plus » : page suivante chargée et ajoutée (la pagination reste pour les robots et sans JS). */
	document.querySelectorAll( '[data-tv-more]' ).forEach( function ( link ) {
		var list = link.closest( '.tv-newsfeed, .tv-agenda, .tv-orgdir, .tv-board' );
		list = list ? list.querySelector( '[data-tv-more-list]' ) : null;
		if ( ! list || ! window.DOMParser ) { return; }
		var pager = link.parentNode.nextElementSibling;
		if ( pager && pager.classList.contains( 'tv-pager' ) ) { pager.hidden = true; }
		link.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			var label = link.innerHTML;
			link.setAttribute( 'aria-busy', 'true' );
			link.textContent = t.loading;
			fetch( link.href, { credentials: 'same-origin' } ).then( function ( res ) { return res.text(); } ).then( function ( html ) {
				var doc = new DOMParser().parseFromString( html, 'text/html' );
				var next = doc.querySelector( '[data-tv-more-list]' );
				var first = null;
				if ( next ) {
					Array.prototype.slice.call( next.children ).forEach( function ( child ) {
						var node = document.importNode( child, true );
						node.classList.add( 'tv-appear' );
						list.appendChild( node );
						if ( ! first ) { first = node; }
					} );
				}
				var more = doc.querySelector( '[data-tv-more]' );
				if ( more ) {
					link.href = more.getAttribute( 'href' );
					link.innerHTML = label;
					link.removeAttribute( 'aria-busy' );
				} else {
					link.parentNode.remove();
				}
				var a = first && first.querySelector( 'a' );
				if ( a ) { a.focus( { preventScroll: true } ); }
			} ).catch( function () { window.location.assign( link.href ); } );
		} );
	} );

	/* Filtres : envoi au changement d'une liste (le bouton reste disponible sans JS). */
	document.querySelectorAll( 'form[data-tv-autosubmit]' ).forEach( function ( form ) {
		form.classList.add( 'is-auto' );
		form.querySelectorAll( 'select' ).forEach( function ( sel ) {
			sel.addEventListener( 'change', function () {
				Array.prototype.forEach.call( form.elements, function ( el ) { if ( el.name && ! el.value ) { el.disabled = true; } } );
				form.submit();
			} );
		} );
		form.addEventListener( 'submit', function () {
			Array.prototype.forEach.call( form.elements, function ( el ) { if ( el.name && ! el.value ) { el.disabled = true; } } );
		} );
	} );

	/* « Nouveau sujet » : focus sur le formulaire. */
	document.querySelectorAll( '[data-tv-open]' ).forEach( function ( a ) {
		a.addEventListener( 'click', function ( e ) {
			var target = document.getElementById( a.getAttribute( 'data-tv-open' ) );
			if ( ! target ) { return; }
			e.preventDefault();
			target.scrollIntoView( { behavior: window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ? 'auto' : 'smooth', block: 'start' } );
			var field = target.querySelector( 'select, input, textarea' );
			if ( field ) { field.focus( { preventScroll: true } ); }
		} );
	} );

	/* Compteurs de caractères. */
	document.querySelectorAll( '[data-tv-count]' ).forEach( function ( field ) {
		var max = parseInt( field.getAttribute( 'data-tv-count' ), 10 );
		var help = field.parentNode.querySelector( '.tv-help' );
		if ( ! help ) { return; }
		var out = document.createElement( 'span' );
		out.className = 'tv-count';
		help.appendChild( document.createTextNode( ' ' ) );
		help.appendChild( out );
		var update = function () { out.textContent = ( t.count || '%1$d / %2$d' ).replace( '%1$d', field.value.length ).replace( '%2$d', max ); };
		field.addEventListener( 'input', update );
		update();
	} );

	/* Publication d'une actualité : rédaction (éditorial) ou communiqué d'organisation. */
	document.querySelectorAll( 'form[data-tv-news-submit]' ).forEach( function ( form ) {
		var intent = 'send';
		var send = form.querySelector( 'button[value="send"]' );
		function mode() {
			var r = form.querySelector( 'input[name="publish_as"]:checked' );
			return r ? r.value : 'editorial';
		}
		function sync() {
			var editorial = mode() === 'editorial';
			form.querySelectorAll( '[data-tv-show="editorial"]' ).forEach( function ( el ) { el.hidden = ! editorial; } );
			if ( send ) { send.textContent = send.getAttribute( editorial ? 'data-label-editorial' : 'data-label-org' ); }
			var aud = form.querySelector( 'select[name="audience"] option[value="org_private"]' );
			if ( aud ) {
				aud.disabled = editorial;
				if ( editorial && aud.selected ) { form.querySelector( 'select[name="audience"]' ).value = 'public'; }
			}
		}
		form.querySelectorAll( 'input[name="publish_as"]' ).forEach( function ( r ) { r.addEventListener( 'change', sync ); } );
		sync();
		form.querySelectorAll( 'button[type="submit"]' ).forEach( function ( b ) {
			b.addEventListener( 'click', function () { intent = b.value || 'send'; } );
		} );
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors( form );
			var status = form.querySelector( '.tv-form-status' );
			var as = mode();
			var editorial = as === 'editorial';
			var val = function ( n ) { var el = form.querySelector( '[name="' + n + '"]' ); return el ? el.value.trim() : ''; };
			var ids = function ( n ) {
				return Array.prototype.map.call( form.querySelectorAll( 'input[name="' + n + '"]:checked' ), function ( c ) { return parseInt( c.value, 10 ); } );
			};
			var body = {
				nature: editorial ? 'editorial' : 'external',
				title: val( 'title' ),
				excerpt: val( 'excerpt' ),
				content: val( 'content' ),
				lang: val( 'lang' ) || 'fr',
				scopes: ids( 'scopes' ),
				regions: ids( 'regions' ),
				audience: val( 'audience' ) || 'public',
				author_display: val( 'author_display' ),
				source_url: val( 'source_url' )
			};
			if ( editorial ) {
				body.source_type = val( 'source_type' ) || 'taxiveo';
				if ( val( 'source_name' ) ) { body.source_name = val( 'source_name' ); }
				body.publish = intent === 'send';
			} else {
				body.source_type = 'organization';
				body.source_org_id = parseInt( as.replace( 'org-', '' ), 10 );
				body.submit = intent === 'send';
			}
			var decl = form.querySelector( 'input[name="declaration"]' );
			if ( intent === 'send' && decl && ! decl.checked ) {
				showErrors( form, { declaration: 'tv_required' } );
				say( status, t.declaration, false );
				return;
			}
			var buttons = form.querySelectorAll( 'button[type="submit"]' );
			buttons.forEach( function ( b ) { b.disabled = true; } );
			say( status, base.saving || base.sending );
			api( 'POST', 'news', body ).then( function ( r ) {
				buttons.forEach( function ( b ) { b.disabled = false; } );
				if ( ! r.ok ) { fail( form, status, r ); return; }
				var st = r.data.status;
				if ( st === 'publish' && r.data.link ) {
					say( status, t.published, true );
					window.setTimeout( function () { window.location.assign( r.data.link ); }, 600 );
					return;
				}
				say( status, st === 'tv-review' ? t.submitted : t.draftSaved, true );
				window.setTimeout( function () { window.location.reload(); }, 1200 );
			} ).catch( function () {
				buttons.forEach( function ( b ) { b.disabled = false; } );
				say( status, base.error, false );
			} );
		} );
	} );
}() );
