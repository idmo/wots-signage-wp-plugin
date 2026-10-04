import type { Playlist, StageSize } from '../shared/types';

export interface PlayerConfig {
	restRoot: string;
	key: string | null;
	nonce: string | null;
	authorized: boolean;
	pollInterval: number;
	brandColor: string;
	stage: StageSize;
	/** Where Esc goes for a logged-in admin; null for the kiosk. */
	exitUrl: string | null;
	build: string;
	/** Only set for the real kiosk (keyed), not for admin previews. */
	swUrl: string | null;
	swScope: string;
}

declare global {
	interface Window {
		wotsSignagePlayer: PlayerConfig;
	}
}

export const config = (): PlayerConfig => window.wotsSignagePlayer;

/**
 * Build an endpoint URL under wots-signage/v1, working with both pretty
 * permalinks (/wp-json/…) and plain ones (?rest_route=…).
 */
function endpoint( path: string ): string {
	const { restRoot, key } = config();
	const url = new URL( restRoot, window.location.href );
	const restRoute = url.searchParams.get( 'rest_route' );
	if ( restRoute !== null ) {
		url.searchParams.set(
			'rest_route',
			restRoute.replace( /\/?$/, '/' ) + path
		);
	} else {
		url.pathname = url.pathname.replace( /\/?$/, '/' ) + path;
	}
	if ( key ) {
		url.searchParams.set( 'key', key );
	}
	// Unique URL per request so no page/edge cache can answer it (PRD §12).
	url.searchParams.set( '_', String( Date.now() ) );
	return url.toString();
}

async function request< T >(
	path: string,
	init: RequestInit = {}
): Promise< T > {
	const { nonce } = config();
	const headers: Record< string, string > = { Accept: 'application/json' };
	if ( nonce ) {
		headers[ 'X-WP-Nonce' ] = nonce;
	}
	if ( init.body ) {
		headers[ 'Content-Type' ] = 'application/json';
	}
	const controller = new AbortController();
	// eslint-disable-next-line @wordpress/no-unused-vars-before-return -- cleared in finally.
	const timer = window.setTimeout( () => controller.abort(), 15000 );
	try {
		const res = await fetch( endpoint( path ), {
			...init,
			headers,
			cache: 'no-store',
			credentials: 'same-origin',
			signal: controller.signal,
		} );
		if ( ! res.ok ) {
			throw new Error( `${ path } → HTTP ${ res.status }` );
		}
		return ( await res.json() ) as T;
	} finally {
		window.clearTimeout( timer );
	}
}

export interface VersionResponse {
	version: string;
	poll_interval: number;
	build: string;
}

export const fetchVersion = () =>
	request< VersionResponse >( 'player/version' );
export const fetchPlaylist = () => request< Playlist >( 'player/playlist' );
export const sendHeartbeat = ( body: Record< string, unknown > ) =>
	request< { ok: boolean } >( 'player/heartbeat', {
		method: 'POST',
		body: JSON.stringify( body ),
	} );
