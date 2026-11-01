/* TaxiVeo — parcours de compte (T-033). Amélioration progressive : les formulaires fonctionnent sans JavaScript.
 * - bouton Afficher / Masquer sur les mots de passe ;
 * - indicateur de force (indicatif : la règle fait foi côté serveur). */
( function () {
	'use strict';
	var cfg = window.taxiveoAccount || { minLength: 12, i18n: {} };
	var t = function ( k, d ) { return ( cfg.i18n && cfg.i18n[ k ] ) || d; };

	function level( v ) {
		if ( v.length < cfg.minLength ) { return 1; }
		var classes = [ /[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/ ].filter( function ( r ) { return r.test( v ); } ).length;
		if ( v.length >= 20 || ( classes >= 3 && v.length >= 16 ) ) { return 3; }
		return classes >= 3 ? 2 : 1;
	}

	document.querySelectorAll( '.tv-account input[data-tv-password]' ).forEach( function ( input ) {
		var wrap = document.createElement( 'div' );
		wrap.className = 'tv-account__pw';
		input.parentNode.insertBefore( wrap, input );
		wrap.appendChild( input );

		var btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'tv-btn tv-btn--ghost tv-btn--sm';
		btn.setAttribute( 'aria-controls', input.id );
		btn.setAttribute( 'aria-pressed', 'false' );
		btn.textContent = t( 'show', 'Afficher' );
		btn.addEventListener( 'click', function () {
			var shown = 'text' === input.type;
			input.type = shown ? 'password' : 'text';
			btn.setAttribute( 'aria-pressed', shown ? 'false' : 'true' );
			btn.textContent = shown ? t( 'show', 'Afficher' ) : t( 'hide', 'Masquer' );
		} );
		wrap.appendChild( btn );

		if ( 'meter' !== input.getAttribute( 'data-tv-password' ) ) { return; }
		var meter = document.createElement( 'div' );
		meter.className = 'tv-account__meter';
		meter.setAttribute( 'aria-hidden', 'true' );
		meter.appendChild( document.createElement( 'span' ) );
		var label = document.createElement( 'p' );
		label.className = 'tv-help';
		label.setAttribute( 'aria-live', 'polite' );
		wrap.parentNode.insertBefore( label, wrap.nextSibling );
		wrap.parentNode.insertBefore( meter, label );
		input.addEventListener( 'input', function () {
			var v = input.value;
			if ( ! v ) { meter.removeAttribute( 'data-level' ); meter.firstChild.style.width = '0'; label.textContent = ''; return; }
			var l = level( v );
			meter.setAttribute( 'data-level', String( l ) );
			meter.firstChild.style.width = ( l * 33.34 ) + '%';
			label.textContent = [ '', t( 'weak', 'Faible' ), t( 'medium', 'Moyen' ), t( 'strong', 'Solide' ) ][ l ];
		} );
	} );
}() );
