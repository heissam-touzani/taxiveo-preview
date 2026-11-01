/*!
 * TaxiVeo — espace membre et Espace Compagnie (taxiveo-core, T-037).
 * Formulaires et actions envoyés à l'API REST taxiveo/v1 avec le nonce wp_rest.
 * Le serveur revérifie tous les droits ; ce script ne fait qu'acheminer et afficher.
 */
( function () {
	'use strict';

	var cfg = window.taxiveoWidgets || { root: '', nonce: '', i18n: {} };
	var base = cfg.i18n || {};
	var t = window.taxiveoSpace || {};
	var codes = Object.assign( {}, base.codes || {}, t.codes || {} );

	function api( method, path, body, isForm ) {
		var headers = { 'X-WP-Nonce': cfg.nonce };
		if ( ! isForm ) { headers[ 'Content-Type' ] = 'application/json'; }
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

	function statusOf( el ) {
		var scope = el.closest( 'form' ) || el.closest( 'li, section, article, .tv-space' ) || document;
		return scope.querySelector( '.tv-form-status' );
	}

	function say( el, text, ok ) {
		if ( ! el ) { return; }
		el.textContent = text || '';
		el.classList.toggle( 'is-ok', ok === true );
		el.classList.toggle( 'is-error', ok === false );
	}

	function errorText( r ) {
		if ( r.status === 401 || ( r.data && r.data.code === 'rest_cookie_invalid_nonce' ) ) { return t.session || base.error; }
		var d = r.data || {};
		var msg = d.message || base.error;
		if ( d.data && d.data.missing && d.data.missing.length ) {
			msg += ' ' + t.missing + ' ' + d.data.missing.map( function ( m ) { return ( t.fieldLabels && t.fieldLabels[ m ] ) || m; } ).join( ', ' ) + '.';
		}
		return msg;
	}

	/* Collecte des champs : conversions data-tv-type, noms à crochets, cases groupées. */
	function setPath( obj, name, value ) {
		var parts = name.replace( /\]/g, '' ).split( '[' );
		var cur = obj;
		for ( var i = 0; i < parts.length - 1; i++ ) {
			var key = parts[ i ];
			var nextIsIndex = /^\d+$/.test( parts[ i + 1 ] );
			if ( cur[ key ] === undefined ) { cur[ key ] = nextIsIndex ? [] : {}; }
			cur = cur[ key ];
		}
		cur[ parts[ parts.length - 1 ] ] = value;
	}

	function collect( form ) {
		var body = {};
		var groups = {};
		var requiredGroups = {};
		Array.prototype.forEach.call( form.elements, function ( el ) {
			if ( ! el.name || el.disabled || el.type === 'submit' || el.type === 'button' || el.type === 'file' ) { return; }
			var type = el.getAttribute( 'data-tv-type' ) || '';
			if ( el.type === 'checkbox' && ( type === 'ids' || type === 'list' ) ) {
				groups[ el.name ] = groups[ el.name ] || [];
				if ( el.getAttribute( 'data-tv-required' ) ) { requiredGroups[ el.name ] = true; }
				if ( el.checked ) { groups[ el.name ].push( type === 'ids' ? parseInt( el.value, 10 ) : el.value ); }
				return;
			}
			if ( type === 'langs' ) {
				groups[ el.name ] = groups[ el.name ] || [];
				if ( el.value ) { groups[ el.name ].push( { term_id: parseInt( el.getAttribute( 'data-term' ), 10 ), level: el.value } ); }
				return;
			}
			if ( el.type === 'checkbox' ) { setPath( body, el.name, el.checked ); return; }
			if ( el.type === 'radio' ) { if ( el.checked ) { setPath( body, el.name, el.value ); } return; }
			var v = typeof el.value === 'string' ? el.value.trim() : el.value;
			if ( v === '' ) { return; }
			if ( type === 'int' ) { v = parseInt( v, 10 ); }
			if ( type === 'float' ) { v = parseFloat( v ); }
			setPath( body, el.name, v );
		} );
		// Un groupe obligatoire vide n'est pas envoyé (brouillon) : le serveur exigera la valeur à la publication.
		Object.keys( groups ).forEach( function ( k ) {
			if ( groups[ k ].length || ! requiredGroups[ k ] ) { body[ k ] = groups[ k ]; }
		} );
		// Questions : on ne garde que celles qui ont un libellé.
		if ( Array.isArray( body.questions ) ) {
			body.questions = body.questions.filter( function ( q ) { return q && q.label; } ).map( function ( q ) { return { label: q.label, required: !! q.required }; } );
		}
		// Adresse vide : non envoyée.
		if ( body.address && ! Object.keys( body.address ).length ) { delete body.address; }
		var extra = form.getAttribute( 'data-extra' );
		if ( extra ) { Object.assign( body, JSON.parse( extra ) ); }
		return body;
	}

	function clearErrors( form ) {
		form.querySelectorAll( '[data-error-for]' ).forEach( function ( p ) { p.hidden = true; p.textContent = ''; } );
		form.querySelectorAll( '[aria-invalid="true"]' ).forEach( function ( el ) { el.removeAttribute( 'aria-invalid' ); } );
	}

	function showErrors( form, fields ) {
		Object.keys( fields || {} ).forEach( function ( key ) {
			var p = form.querySelector( '[data-error-for="' + key + '"]' ) || form.querySelector( '[data-error-for^="' + key + '["]' );
			if ( ! p ) { return; }
			p.textContent = codes[ fields[ key ] ] || codes.tv_invalid || fields[ key ];
			p.hidden = false;
			var input = form.querySelector( '[name="' + key + '"], [name^="' + key + '["]' );
			if ( input ) { input.setAttribute( 'aria-invalid', 'true' ); }
		} );
		// Focus sur le premier champ en erreur dans l'ordre de lecture.
		var first = form.querySelector( '[aria-invalid="true"]' );
		if ( first ) { first.focus(); }
	}

	function fail( form, status, r ) {
		say( status, errorText( r ), false );
		var fields = r.data && r.data.data && r.data.data.fields;
		if ( fields && ! Array.isArray( fields ) ) { showErrors( form, fields ); }
	}

	function done( el, r ) {
		var target = el.getAttribute( 'data-redirect' );
		if ( target ) {
			var id = r && r.data && ( r.data.id || r.data.company_id );
			window.location.assign( target.replace( encodeURIComponent( '{id}' ), id ).replace( '{id}', id ) );
			return;
		}
		if ( el.getAttribute( 'data-reload' ) ) { window.location.reload(); }
	}

	/* Formulaires génériques. */
	document.querySelectorAll( 'form[data-tv-form]' ).forEach( function ( form ) {
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			var status = form.querySelector( '.tv-form-status' );
			var confirmText = form.getAttribute( 'data-confirm' );
			if ( confirmText && ! window.confirm( confirmText ) ) { return; }
			clearErrors( form );
			var button = form.querySelector( 'button[type="submit"]' );
			if ( button ) { button.disabled = true; }
			say( status, base.sending );
			api( form.getAttribute( 'data-method' ) || 'POST', form.getAttribute( 'data-path' ), collect( form ) ).then( function ( r ) {
				if ( button ) { button.disabled = false; }
				if ( ! r.ok ) { fail( form, status, r ); return; }
				say( status, form.getAttribute( 'data-success' ) || t.done, true );
				done( form, r );
			} ).catch( function () {
				if ( button ) { button.disabled = false; }
				say( status, base.error, false );
			} );
		} );
	} );

	/* Boutons d'action (révoquer, clôturer, changer un statut…). */
	document.querySelectorAll( '[data-tv-action]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var confirmText = btn.getAttribute( 'data-confirm' );
			if ( confirmText && ! window.confirm( confirmText ) ) { return; }
			var status = statusOf( btn );
			btn.disabled = true;
			say( status, base.sending );
			var raw = btn.getAttribute( 'data-body' );
			api( btn.getAttribute( 'data-method' ) || 'POST', btn.getAttribute( 'data-path' ), raw ? JSON.parse( raw ) : {} ).then( function ( r ) {
				if ( ! r.ok ) { btn.disabled = false; say( status, errorText( r ), false ); return; }
				say( status, t.done, true );
				done( btn, r );
			} ).catch( function () {
				btn.disabled = false;
				say( status, base.error, false );
			} );
		} );
	} );

	/* Lecture enregistrée par l'API (candidature ouverte, messages lus). */
	document.querySelectorAll( '[data-tv-ping]' ).forEach( function ( el ) {
		api( 'GET', el.getAttribute( 'data-tv-ping' ) ).then( function ( r ) {
			if ( r.ok && el.getAttribute( 'data-tv-ping-reload' ) && r.data && r.data.status && r.data.status !== 'sent' ) {
				window.location.reload();
			}
		} ).catch( function () {} );
	} );

	/* Demande de vérification : justificatif (/documents) puis demande (/companies/{id}/verification). */
	document.querySelectorAll( 'form[data-tv-verify]' ).forEach( function ( form ) {
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors( form );
			var status = form.querySelector( '.tv-form-status' );
			var file = form.querySelector( 'input[type="file"]' );
			var decl = form.querySelector( 'input[name="declaration"]' );
			if ( ! file.files.length ) { showErrors( form, { file: 'tv_required' } ); say( status, t.fileMissing, false ); return; }
			if ( ! decl.checked ) { showErrors( form, { declaration: 'tv_required' } ); say( status, t.declaration, false ); return; }
			var id = form.getAttribute( 'data-company' );
			var button = form.querySelector( 'button[type="submit"]' );
			button.disabled = true;
			say( status, t.uploading );
			var data = new FormData();
			data.append( 'file', file.files[ 0 ] );
			data.append( 'doc_type', 'company_proof' );
			data.append( 'subject_type', 'company' );
			data.append( 'subject_id', id );
			api( 'POST', 'documents', data, true ).then( function ( up ) {
				if ( ! up.ok ) { throw up; }
				return api( 'POST', 'companies/' + id + '/verification', { declaration: true, documents: [ up.data.id ] } );
			} ).then( function ( r ) {
				if ( ! r.ok ) { throw r; }
				say( status, t.done, true );
				window.location.reload();
			} ).catch( function ( r ) {
				button.disabled = false;
				say( status, r && r.data ? errorText( r ) : base.error, false );
			} );
		} );
	} );

	/* Éditeur d'offre : enregistrement (POST / PATCH) puis publication éventuelle. */
	document.querySelectorAll( 'form[data-tv-job]' ).forEach( function ( form ) {
		var intent = 'save';
		form.querySelectorAll( 'button[type="submit"]' ).forEach( function ( b ) {
			b.addEventListener( 'click', function () { intent = b.value || 'save'; } );
		} );
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			clearErrors( form );
			var status = form.querySelector( '.tv-form-status' );
			var body = collect( form );
			var jobId = parseInt( form.getAttribute( 'data-job' ), 10 ) || 0;
			var company = form.getAttribute( 'data-company' );
			var published = form.getAttribute( 'data-status' ) === 'publish';
			if ( ! body.compliance_ack ) { delete body.compliance_ack; }
			if ( intent === 'publish' && ! body.compliance_ack ) {
				showErrors( form, { compliance_ack: 'tv_compliance_required' } );
				say( status, t.compliance, false );
				return;
			}
			if ( jobId && ! published && body.questions === undefined ) { body.questions = []; }
			var buttons = form.querySelectorAll( 'button[type="submit"]' );
			buttons.forEach( function ( b ) { b.disabled = true; } );
			say( status, base.saving );
			var save = jobId ? api( 'PATCH', 'jobs/' + jobId, body ) : api( 'POST', 'companies/' + company + '/jobs', body );
			save.then( function ( r ) {
				if ( ! r.ok ) { throw r; }
				jobId = r.data.id || jobId;
				form.setAttribute( 'data-job', jobId );
				if ( intent !== 'publish' ) { return { ok: true, data: r.data, draft: true }; }
				return api( 'POST', 'jobs/' + jobId + '/transitions', { to: 'publish', compliance_ack: true } );
			} ).then( function ( r ) {
				if ( ! r.ok ) { throw r; }
				var msg = r.draft ? ( published ? t.done : t.draftSaved ) : ( r.data.status === 'tv-review' ? t.review : t.published );
				say( status, msg, true );
				var target = form.getAttribute( 'data-redirect' );
				if ( target ) { window.setTimeout( function () { window.location.assign( target ); }, 600 ); }
			} ).catch( function ( r ) {
				buttons.forEach( function ( b ) { b.disabled = false; } );
				if ( r && r.data ) { fail( form, status, r ); } else { say( status, base.error, false ); }
			} );
		} );
	} );
}() );

/*
 * T-046 (agent B) : Mon Passeport par sections (validation en direct, état des sections,
 * sommaire, carte des régions, aperçu « recruteurs », sauvegarde rassurante) et
 * navigation latérale de l'espace membre. L'envoi reste assuré par widgets.js.
 */
( function () {
	'use strict';
	var reduce = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	/* Onglets mobiles de l'espace : l'entrée courante est ramenée dans la zone visible. */
	document.querySelectorAll( '[data-tv-sidenav]' ).forEach( function ( nav ) {
		var cur = nav.querySelector( '[aria-current="page"]' );
		if ( cur && nav.scrollWidth > nav.clientWidth ) {
			nav.scrollLeft = Math.max( 0, cur.offsetLeft - 16 );
		}
	} );

	var SLUGS = [ 'be-vwv', 'be-vov', 'be-van', 'be-vli', 'be-wht', 'be-bru', 'be-vbr', 'be-wlg', 'be-wbr', 'be-wna', 'be-wlx' ];
	var REGS = [ 'be-vlg', 'be-vlg', 'be-vlg', 'be-vlg', 'be-wal', 'be-bru', 'be-vlg', 'be-wal', 'be-wal', 'be-wal', 'be-wal' ];

	document.querySelectorAll( '[data-tv-mypp2]' ).forEach( function ( root ) {
		var form = root.querySelector( 'form' );
		if ( ! form ) { return; }
		var l = {};
		try { l = JSON.parse( root.getAttribute( 'data-tv-l10n' ) || '{}' ); } catch ( e ) { l = {}; }
		var fmt = function ( s, v ) { return String( s || '' ).replace( /%[ds]/, v ); };
		var dirty = root.querySelector( '[data-tv-dirty]' );
		var bar = root.querySelector( '.tv-mypp2-bar' );
		var status = form.querySelector( '.tv-form-status' );
		var isDirty = false;

		function checked( name ) { return form.querySelectorAll( 'input[name="' + name + '"]:checked' ).length; }
		function val( name ) { var el = form.querySelector( '[name="' + name + '"]' ); return el ? String( el.value || '' ).trim() : ''; }
		function langs() { return Array.prototype.filter.call( form.querySelectorAll( 'select[name="language"]' ), function ( s ) { return !! s.value; } ).length; }
		var rules = {
			where: function () { var n = checked( 'regions' ); return n >= 1 && n <= 5; },
			exp: function () { return val( 'experience_years' ) !== '' && val( 'pro_status' ) !== '' && ( ! form.querySelector( 'input[name="activity_types"]' ) || checked( 'activity_types' ) > 0 ); },
			langs: function () { return langs() > 0; },
			search: function () { return checked( 'opportunities' ) > 0 && val( 'availability_status' ) !== '' && ( val( 'availability_status' ) !== 'from' || val( 'available_from' ) !== '' ); },
			about: function () { return val( 'presentation' ).length >= 40; },
			vis: function () { return checked( 'visibility' ) > 0; }
		};

		function refresh() {
			Object.keys( rules ).forEach( function ( key ) {
				var ok = rules[ key ]();
				var sec = form.querySelector( '[data-tv-sec="' + key + '"]' );
				var st = sec ? sec.querySelector( '[data-tv-sec-state]' ) : null;
				if ( st ) { st.hidden = ! ok; }
				var toc = root.querySelector( '[data-tv-toc="' + key + '"]' );
				if ( toc ) { toc.classList.toggle( 'is-done', ok ); }
			} );
			var n = checked( 'regions' );
			var c = root.querySelector( '[data-tv-count-regions]' );
			if ( c ) { c.textContent = fmt( l.regions, n ); c.classList.toggle( 'is-over', n > 5 ); }
			var err = form.querySelector( '[data-error-for="regions"]' );
			if ( err && n > 5 ) { err.textContent = l.tooMany || ''; err.hidden = false; } else if ( err && err.textContent === l.tooMany ) { err.hidden = true; err.textContent = ''; }
			var on = {};
			form.querySelectorAll( 'input[name="regions"]:checked' ).forEach( function ( i ) { on[ i.getAttribute( 'data-slug' ) ] = true; } );
			root.querySelectorAll( '[data-tv-region-map] .tv-pp2-map__tile' ).forEach( function ( g, idx ) {
				g.classList.toggle( 'is-on', !! ( on[ SLUGS[ idx ] ] || on[ REGS[ idx ] ] ) );
			} );
			form.querySelectorAll( 'select[name="language"]' ).forEach( function ( s ) {
				var box = s.closest( '.tv-mypp2-lang' );
				if ( box ) { box.classList.toggle( 'is-on', !! s.value ); }
			} );
			var from = form.querySelector( '[data-tv-show-from]' );
			if ( from ) { from.hidden = val( 'availability_status' ) !== 'from'; }
			var pres = val( 'presentation' );
			var pc = root.querySelector( '[data-tv-count-pres]' );
			if ( pc ) { pc.textContent = fmt( l.chars, pres.length ); }
			var warn = root.querySelector( '[data-tv-pres-warn]' );
			if ( warn ) { warn.hidden = ! ( /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test( pres ) || /(\+32|0032|\b0)[\s./-]?\d([\s./-]?\d){7,}/.test( pres ) || /(https?:\/\/|www\.)/i.test( pres ) ); }
			var exp = form.querySelector( '[name="experience_years"]' );
			var expErr = form.querySelector( '[data-error-for="experience_years"]' );
			if ( exp && expErr ) {
				var num = parseInt( exp.value, 10 );
				var bad = exp.value !== '' && ( isNaN( num ) || num < 0 || num > 50 );
				if ( bad ) {
					expErr.textContent = l.expRange || '';
					expErr.hidden = false;
					exp.setAttribute( 'aria-invalid', 'true' );
				} else if ( expErr.textContent === l.expRange ) {
					expErr.hidden = true;
					expErr.textContent = '';
					exp.removeAttribute( 'aria-invalid' );
				}
			}
		}

		function markDirty() {
			isDirty = true;
			if ( dirty ) { dirty.hidden = false; }
			if ( status && status.classList.contains( 'is-ok' ) ) { status.textContent = ''; status.classList.remove( 'is-ok' ); }
		}
		form.addEventListener( 'input', function () { markDirty(); refresh(); } );
		form.addEventListener( 'change', function () { markDirty(); refresh(); } );
		refresh();

		/* Sauvegarde confirmée par widgets.js (classe is-ok) : heure, halo, état propre. */
		if ( status && window.MutationObserver ) {
			new MutationObserver( function () {
				if ( ! status.classList.contains( 'is-ok' ) || ! isDirty ) { return; }
				isDirty = false;
				if ( dirty ) { dirty.hidden = true; }
				var now = new Date();
				var hh = ( '0' + now.getHours() ).slice( -2 ) + ':' + ( '0' + now.getMinutes() ).slice( -2 );
				if ( l.saved ) { status.textContent = status.textContent + ' ' + fmt( l.saved, hh ) + '.'; }
				if ( bar && ! reduce ) { bar.classList.remove( 'is-saved' ); void bar.offsetWidth; bar.classList.add( 'is-saved' ); }
			} ).observe( status, { attributes: true, attributeFilter: [ 'class' ] } );
		}
		window.addEventListener( 'beforeunload', function ( e ) {
			if ( isDirty ) { e.preventDefault(); e.returnValue = l.leave || ''; }
		} );

		/* Sommaire : section active au défilement. */
		var tocLinks = root.querySelectorAll( '[data-tv-toc]' );
		if ( tocLinks.length && 'IntersectionObserver' in window ) {
			var io = new IntersectionObserver( function ( entries ) {
				entries.forEach( function ( en ) {
					if ( ! en.isIntersecting ) { return; }
					var key = en.target.getAttribute( 'data-tv-sec' );
					tocLinks.forEach( function ( a ) { a.classList.toggle( 'is-active', a.getAttribute( 'data-tv-toc' ) === key ); } );
				} );
			}, { rootMargin: '-30% 0px -60% 0px' } );
			form.querySelectorAll( '[data-tv-sec]' ).forEach( function ( s ) { io.observe( s ); } );
		}

		/* Aperçu « recruteurs » : dialog natif (Échap géré par le navigateur), focus rendu au bouton. */
		var dlg = root.querySelector( '.tv-mypp2-preview' );
		var opener = root.querySelector( '[data-tv-preview-open]' );
		if ( dlg && opener && typeof dlg.showModal === 'function' ) {
			var close = function () { dlg.close(); opener.focus(); };
			opener.addEventListener( 'click', function () { dlg.showModal(); } );
			dlg.querySelectorAll( '[data-tv-preview-close]' ).forEach( function ( b ) { b.addEventListener( 'click', close ); } );
			dlg.addEventListener( 'click', function ( e ) { if ( e.target === dlg ) { close(); } } );
		} else if ( opener ) {
			opener.hidden = true;
		}
	} );
}() );
