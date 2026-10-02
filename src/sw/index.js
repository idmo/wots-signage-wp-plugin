/* global self, caches */
/**
 * Offline support for the kiosk player (PRD §8.4).
 *
 * Served from /signage/sw.js so its scope covers /signage/player/. It keeps:
 *  - the player page and the scripts/styles it loads ("shell"), so the
 *    player can start with no network after a power cut;
 *  - the last good playlist;
 *  - every image and video the playlist references ("media").
 *
 * The player posts the current list of media URLs after each new playlist;
 * anything not on the list is evicted so the cache stays bounded.
 */

const VERSION = 'v1';
const SHELL = `wots-shell-${ VERSION }`;
const DATA = `wots-data-${ VERSION }`;
const MEDIA = `wots-media-${ VERSION }`;
const KEEP = [ SHELL, DATA, MEDIA ];
const NETWORK_TIMEOUT_MS = 8000;

self.addEventListener( 'install', () => self.skipWaiting() );

self.addEventListener( 'activate', ( event ) => {
	event.waitUntil(
		( async () => {
			for ( const name of await caches.keys() ) {
				if ( name.startsWith( 'wots-' ) && ! KEEP.includes( name ) ) {
					await caches.delete( name );
				}
			}
			await self.clients.claim();
		} )()
	);
} );

/** REST route of a request, for both /wp-json/… and ?rest_route=… URLs. */
function restRoute( url ) {
	const param = url.searchParams.get( 'rest_route' );
	if ( param ) {
		return param;
	}
	const i = url.pathname.indexOf( '/wp-json/' );
	return i >= 0 ? url.pathname.slice( i + 8 ) : '';
}

/** Cache key without the per-request cache-buster. */
function stableKey( url ) {
	const u = new URL( url );
	u.searchParams.delete( '_' );
	return u.toString();
}

function withTimeout( promise, ms ) {
	return new Promise( ( resolve, reject ) => {
		const t = setTimeout( () => reject( new Error( 'timeout' ) ), ms );
		promise.then(
			( v ) => {
				clearTimeout( t );
				resolve( v );
			},
			( e ) => {
				clearTimeout( t );
				reject( e );
			}
		);
	} );
}

/** Network first; on success remember it, on failure answer from cache. */
async function networkFirst( request, cacheName, key ) {
	const cache = await caches.open( cacheName );
	try {
		const response = await withTimeout(
			fetch( request ),
			NETWORK_TIMEOUT_MS
		);
		if ( response.ok ) {
			await cache.put( key, response.clone() );
		}
		return response;
	} catch ( err ) {
		const cached = await cache.match( key );
		if ( cached ) {
			return cached;
		}
		throw err;
	}
}

/** Serve from cache right away, refresh in the background. */
async function staleWhileRevalidate( request ) {
	const cache = await caches.open( SHELL );
	const cached = await cache.match( request );
	const refresh = () =>
		fetch( request ).then( ( response ) => {
			if ( response.ok ) {
				cache.put( request, response.clone() );
			}
			return response;
		} );
	if ( cached ) {
		refresh().catch( () => {} );
		return cached;
	}
	return refresh();
}

/** A 206 slice of a cached response, so <video> can seek offline. */
async function rangeResponse( request, cached ) {
	const header = request.headers.get( 'range' );
	const match = /bytes=(\d*)-(\d*)/.exec( header || '' );
	if ( ! match || cached.type === 'opaque' ) {
		return cached;
	}
	const blob = await cached.blob();
	const start = match[ 1 ] ? parseInt( match[ 1 ], 10 ) : 0;
	const end = match[ 2 ] ? parseInt( match[ 2 ], 10 ) : blob.size - 1;
	if ( start >= blob.size ) {
		return new Response( null, {
			status: 416,
			headers: { 'Content-Range': `bytes */${ blob.size }` },
		} );
	}
	const slice = blob.slice( start, end + 1 );
	return new Response( slice, {
		status: 206,
		statusText: 'Partial Content',
		headers: {
			'Content-Type': cached.headers.get( 'Content-Type' ) || blob.type,
			'Content-Length': String( slice.size ),
			'Content-Range': `bytes ${ start }-${ start + slice.size - 1 }/${ blob.size }`,
			'Accept-Ranges': 'bytes',
		},
	} );
}

async function fromMedia( request ) {
	const cache = await caches.open( MEDIA );
	const cached = await cache.match( request.url );
	if ( cached ) {
		return request.headers.has( 'range' )
			? rangeResponse( request, cached )
			: cached;
	}
	return null;
}

self.addEventListener( 'fetch', ( event ) => {
	const { request } = event;
	if ( request.method !== 'GET' ) {
		return; // Heartbeats and anything else go straight to the network.
	}
	// The player page itself.
	if ( request.mode === 'navigate' ) {
		event.respondWith(
			networkFirst( request, SHELL, stableKey( request.url ) )
		);
		return;
	}

	const url = new URL( request.url );
	const route = restRoute( url );

	if ( route.startsWith( '/wots-signage/v1/player/playlist' ) ) {
		event.respondWith(
			networkFirst( request, DATA, stableKey( request.url ) )
		);
		return;
	}
	if ( route ) {
		return; // Version checks etc.: live or failed, never cached.
	}

	event.respondWith(
		( async () => {
			const media = await fromMedia( request );
			if ( media ) {
				return media;
			}
			// Scripts, styles, and fonts the player page loads.
			if (
				url.origin === self.location.origin &&
				[ 'script', 'style', 'font' ].includes( request.destination )
			) {
				return staleWhileRevalidate( request );
			}
			return fetch( request );
		} )()
	);
} );

/** Download what's missing, evict what's no longer used. */
async function syncMedia( urls ) {
	const cache = await caches.open( MEDIA );
	const wanted = new Set( urls );
	const failed = [];

	for ( const request of await cache.keys() ) {
		if ( ! wanted.has( request.url ) ) {
			await cache.delete( request );
		}
	}
	for ( const url of wanted ) {
		if ( await cache.match( url ) ) {
			continue;
		}
		try {
			const sameOrigin = new URL( url ).origin === self.location.origin;
			const response = await fetch( url, {
				mode: sameOrigin ? 'same-origin' : 'no-cors',
				credentials: 'omit',
			} );
			if ( response.ok || response.type === 'opaque' ) {
				await cache.put( url, response );
			} else {
				failed.push( url );
			}
		} catch {
			failed.push( url );
		}
	}
	return { cached: wanted.size - failed.length, failed: failed.length };
}

let syncing = Promise.resolve();

self.addEventListener( 'message', ( event ) => {
	const data = event.data || {};
	if ( data.type === 'cache-media' && Array.isArray( data.urls ) ) {
		// One sync at a time; the newest list wins.
		syncing = syncing
			.catch( () => {} )
			.then( () => syncMedia( data.urls ) )
			.then(
				( result ) =>
					event.source &&
					event.source.postMessage( {
						type: 'media-synced',
						...result,
					} )
			);
		event.waitUntil( syncing );
	}
} );
