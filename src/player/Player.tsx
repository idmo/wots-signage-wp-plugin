import { useEffect, useRef, useState } from '@wordpress/element';
import { FitImage, FitVideo } from '../shared/Media';
import { PanelBackground } from '../shared/Panel';
import { SlideContent } from '../shared/SlideRenderer';
import { Stage } from '../shared/Stage';
import type { Playlist, PlaylistItem } from '../shared/types';
import { config, fetchPlaylist, fetchVersion, sendHeartbeat } from './api';

interface Layer {
	id: number;
	item: PlaylistItem;
}

const HEARTBEAT_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const EMPTY_RECHECK_MS = 5_000;

/**
 * The kiosk loop (PRD §8.3):
 *  - polls the cheap version endpoint every poll interval;
 *  - downloads the full playlist only when the version changes;
 *  - swaps in a new playlist at the next item boundary, never mid-slide;
 *  - keeps looping what it has if the network or site is down, retrying
 *    with backoff. (Phase 2's service worker adds offline media caching.)
 */
export function Player() {
	const cfg = config();
	const [ layers, setLayers ] = useState< Layer[] >( [] );
	const [ brandColor, setBrandColor ] = useState( cfg.brandColor );
	const [ loaded, setLoaded ] = useState( false );
	const [ offline, setOffline ] = useState( false );

	const active = useRef< Playlist | null >( null );
	const pending = useRef< Playlist | null >( null );
	const index = useRef( -1 );
	const currentKey = useRef< string | null >( null );
	const previousGroup = useRef< string | null >( null );
	const layerSeq = useRef( 0 );
	const advanceTimer = useRef< number | undefined >( undefined );
	const trimTimer = useRef< number | undefined >( undefined );
	const lastError = useRef( '' );
	const isOffline = useRef( false );

	// --- Advancing -----------------------------------------------------------

	const schedule = ( ms: number ) => {
		window.clearTimeout( advanceTimer.current );
		advanceTimer.current = window.setTimeout(
			() => advanceRef.current(),
			ms
		);
	};

	const advance = () => {
		window.clearTimeout( advanceTimer.current );

		let next = index.current + 1;
		if ( pending.current ) {
			active.current = pending.current;
			pending.current = null;
			setBrandColor(
				active.current.settings.brand_color || cfg.brandColor
			);
			const found = active.current.items.findIndex(
				( i ) => i.key === currentKey.current
			);
			if ( found >= 0 ) {
				next = found + 1;
			}
		}

		const items = active.current?.items ?? [];
		if ( items.length === 0 ) {
			index.current = -1;
			currentKey.current = null;
			previousGroup.current = null;
			setLayers( [] );
			schedule( EMPTY_RECHECK_MS );
			return;
		}

		next = next % items.length;
		const item = items[ next ];

		// A one-item show of a still image: nothing to transition to.
		const sameStill =
			item.key === currentKey.current &&
			items.length === 1 &&
			item.type !== 'video';
		index.current = next;
		currentKey.current = item.key;

		if ( ! sameStill ) {
			const sameBlock =
				previousGroup.current !== null &&
				previousGroup.current === item.group &&
				item.type === 'slide';
			if ( sameBlock ) {
				// Next item of the same carousel: keep the layer (and its
				// background), swap the content, which replays its animation.
				setLayers( ( prev ) =>
					prev.length
						? [
								...prev.slice( 0, -1 ),
								{ ...prev[ prev.length - 1 ], item },
							]
						: [ { id: ++layerSeq.current, item } ]
				);
			} else {
				const id = ++layerSeq.current;
				setLayers( ( prev ) => [ ...prev.slice( -1 ), { id, item } ] );
				window.clearTimeout( trimTimer.current );
				const ms =
					item.transition?.type === 'cut'
						? 0
						: ( item.transition?.ms ?? 800 );
				trimTimer.current = window.setTimeout(
					() => setLayers( ( prev ) => prev.slice( -1 ) ),
					ms + 100
				);
			}
		}
		previousGroup.current = item.group;

		// Videos advance on `ended`; the timer is a safety net if that never fires.
		const seconds = Math.max( 1, item.duration || 10 );
		schedule( ( item.type === 'video' ? seconds + 10 : seconds ) * 1000 );

		preload( items[ ( next + 1 ) % items.length ] );
	};

	const advanceRef = useRef( advance );
	advanceRef.current = advance;

	const onMediaEnded = ( layerId: number ) => {
		if ( layerId === layerSeq.current ) {
			advanceRef.current();
		}
	};

	const onMediaError = ( layerId: number, message: string ) => {
		lastError.current = message;
		if ( layerId === layerSeq.current ) {
			schedule( 1000 );
		}
	};

	// --- Version polling -----------------------------------------------------

	useEffect( () => {
		let stopped = false;
		let timer: number | undefined;
		let failures = 0;
		let pollMs = Math.max( 5, cfg.pollInterval ) * 1000;
		let knownVersion: string | null = null;

		const tick = async () => {
			try {
				const v = await fetchVersion();
				pollMs =
					Math.max( 5, v.poll_interval || cfg.pollInterval ) * 1000;

				if ( v.build && v.build !== cfg.build && reloadAllowed() ) {
					window.location.reload(); // Plugin was updated on the server.
					return;
				}

				if ( v.version !== knownVersion ) {
					const playlist = await fetchPlaylist();
					knownVersion = playlist.version;
					cacheMedia( playlist );
					if (
						! active.current ||
						active.current.items.length === 0
					) {
						// Nothing on screen yet: start right away.
						pending.current = playlist;
						advanceRef.current();
					} else {
						pending.current = playlist;
					}
					setLoaded( true );
				}

				failures = 0;
				isOffline.current = false;
				setOffline( false );
			} catch ( e ) {
				// Offline at startup: the service worker can still answer the
				// playlist request with the last good copy.
				if ( ! active.current && ! pending.current ) {
					try {
						const cachedPlaylist = await fetchPlaylist();
						knownVersion = null; // Re-check properly once back online.
						pending.current = cachedPlaylist;
						advanceRef.current();
						setLoaded( true );
					} catch {
						// Nothing cached yet; keep retrying.
					}
				}
				failures++;
				isOffline.current = true;
				setOffline( true );
				lastError.current =
					e instanceof Error ? e.message : String( e );
			}

			if ( ! stopped ) {
				const wait = failures
					? Math.min(
							pollMs * 2 ** Math.min( failures, 6 ),
							MAX_BACKOFF_MS
						)
					: pollMs;
				timer = window.setTimeout( tick, wait );
			}
		};

		tick();
		return () => {
			stopped = true;
			window.clearTimeout( timer );
		};
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps -- run once for the life of the page.

	// --- Offline cache (PRD §8.4) ----------------------------------------------

	useEffect( () => {
		if ( ! cfg.swUrl || ! ( 'serviceWorker' in navigator ) ) {
			return;
		}
		navigator.serviceWorker
			.register( cfg.swUrl, { scope: cfg.swScope } )
			.catch( ( e: Error ) => {
				lastError.current = `Offline mode unavailable: ${ e.message }`;
			} );
		// Ask the browser not to evict the cache under storage pressure.
		navigator.storage?.persist?.().catch( () => {} );
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps -- once per page.

	/** Tell the service worker which media to keep for offline playback. */
	const cacheMedia = ( playlist: Playlist ) => {
		if ( ! cfg.swUrl || ! ( 'serviceWorker' in navigator ) ) {
			return;
		}
		const urls = Array.from(
			new Set( playlist.items.flatMap( mediaUrls ) )
		);
		navigator.serviceWorker.ready
			.then( ( reg ) =>
				reg.active?.postMessage( { type: 'cache-media', urls } )
			)
			.catch( () => {} );
	};

	// --- Heartbeat & housekeeping -------------------------------------------

	useEffect( () => {
		const startedAt = Date.now();
		const beat = () => {
			const items = active.current?.items ?? [];
			const current = items[ index.current ];
			sendHeartbeat( {
				version: active.current?.version ?? '',
				item_key: current?.key ?? '',
				item_name: current ? itemLabel( current ) : '',
				last_error: lastError.current,
				offline: isOffline.current,
				screen: `${ window.innerWidth }×${ window.innerHeight }`,
			} ).catch( () => {} );

			// Daily fresh start around 4am to keep a long-running kiosk tidy.
			const hour = new Date().getHours();
			if (
				hour === 4 &&
				Date.now() - startedAt > 20 * 3600_000 &&
				! isOffline.current
			) {
				window.location.reload();
			}
		};
		const first = window.setTimeout( beat, 5000 );
		const interval = window.setInterval( beat, HEARTBEAT_MS );
		return () => {
			window.clearTimeout( first );
			window.clearInterval( interval );
		};
	}, [] );

	useEffect(
		() => () => {
			window.clearTimeout( advanceTimer.current );
			window.clearTimeout( trimTimer.current );
		},
		[]
	);

	// --- Render --------------------------------------------------------------

	return (
		<>
			<Stage>
				{ layers.length === 0 && (
					<div
						className="wots-idle"
						style={ { background: brandColor } }
					>
						{ loaded ? 'Nothing scheduled right now' : '' }
					</div>
				) }
				{ layers.map( ( layer, i ) => {
					const isTop = i === layers.length - 1;
					// The incoming item's transition drives both layers.
					const t =
						layers[ layers.length - 1 ].item.transition?.type ??
						'crossfade';
					const ms =
						layers[ layers.length - 1 ].item.transition?.ms ?? 800;
					const anim =
						t === 'cut'
							? ''
							: ` wots-${ isTop ? 'in' : 'out' }-${ t }`;
					return (
						<div
							className={ `wots-layer${ anim }` }
							key={ layer.id }
							style={ {
								zIndex: isTop ? 2 : 1,
								animationDuration: `${ ms }ms`,
							} }
						>
							<ItemView
								item={ layer.item }
								onEnded={ () => onMediaEnded( layer.id ) }
								onError={ ( m ) => onMediaError( layer.id, m ) }
							/>
						</div>
					);
				} ) }
			</Stage>
			{ offline && (
				<div
					className="wots-status-dot"
					title="Can't reach the website — still playing"
				/>
			) }
		</>
	);
}

function ItemView( {
	item,
	onEnded,
	onError,
}: {
	item: PlaylistItem;
	onEnded: () => void;
	onError: ( message: string ) => void;
} ) {
	switch ( item.type ) {
		case 'image':
			return <FitImage image={ item.image } fit={ item.fit } />;
		case 'video':
			return (
				<FitVideo
					video={ item.video }
					fit={ item.fit }
					onEnded={ onEnded }
					onError={ onError }
				/>
			);
		case 'slide':
			return (
				<>
					<PanelBackground panel={ item.panel } />
					<SlideContent item={ item } />
				</>
			);
	}
	return null;
}

function itemLabel( item: PlaylistItem ): string {
	if ( item.type === 'slide' && item.mode === 'carousel' ) {
		const title = item.fields.title ?? item.fields.book_title;
		if ( title ) {
			return `${ item.block_name }: ${ String( title ) }`;
		}
	}
	return item.block_name;
}

/** Every image/video URL an item shows (for preloading and offline caching). */
export function mediaUrls( item: PlaylistItem ): string[] {
	const urls: string[] = [];
	const add = ( v: unknown ) => {
		const url = ( v as { url?: string } | null )?.url;
		if ( url ) {
			urls.push( url );
		}
	};
	if ( item.type === 'image' ) {
		add( item.image );
	} else if ( item.type === 'video' ) {
		urls.push( item.video.url );
		add( item.video.poster );
	} else {
		add( item.panel.background );
		const rows = item.mode === 'list' ? item.items : [ item.fields ];
		for ( const fields of rows ) {
			for ( const key of [
				'featured_image',
				'book_cover',
				'reader_photo',
			] ) {
				add( fields[ key ] );
			}
		}
	}
	return urls;
}

/** Warm the browser cache for the next item's image(s). */
function preload( item: PlaylistItem | undefined ) {
	if ( ! item ) {
		return;
	}
	mediaUrls( item )
		.filter( ( url ) => ! /\.(mp4|webm|mov|m4v)(\?|$)/i.test( url ) )
		.forEach( ( url ) => {
			const img = new Image();
			img.src = url;
		} );
}

/** Guard against a reload loop if a stale bundle is ever served. */
function reloadAllowed(): boolean {
	try {
		const last = Number(
			window.sessionStorage.getItem( 'wots-signage-reloaded' ) || 0
		);
		if ( Date.now() - last < 10 * 60_000 ) {
			return false;
		}
		window.sessionStorage.setItem(
			'wots-signage-reloaded',
			String( Date.now() )
		);
		return true;
	} catch {
		return false;
	}
}
