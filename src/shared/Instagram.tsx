import { useEffect, useRef, useState } from '@wordpress/element';
import { followerFetcher } from './live';
import { Qr } from './Qr';
import type { Fields, ImageAsset, MediaAsset } from './types';

/** How often the follower counter re-checks while on screen. */
const FOLLOWER_POLL_MS = 15_000;
const COUNT_UP_MS = 1500;

const str = ( v: unknown ) =>
	v === null || v === undefined ? '' : String( v );

/**
 * An Instagram photo, or a video/reel playing muted on a loop.
 */
export function MediaView( {
	media,
	fit = 'contain',
	className = '',
}: {
	media: MediaAsset | null | undefined;
	fit?: 'cover' | 'contain';
	className?: string;
} ) {
	if ( ! media?.url ) {
		return <div className={ `${ className } is-empty` } />;
	}
	const cls = `${ className } is-${ fit }`;
	if ( media.kind === 'video' ) {
		return (
			<video
				className={ cls }
				src={ media.url }
				poster={ media.poster ?? undefined }
				autoPlay
				muted
				loop
				playsInline
			/>
		);
	}
	return <img className={ cls } src={ media.url } alt="" />;
}

/**
 * Built-in Instagram post layout: the post in a tall 9:16 frame on the
 * left, caption on the right. With no caption the post sits centered.
 */
export function InstagramCard( { fields }: { fields: Fields } ) {
	const media = fields.media as MediaAsset | null;
	const caption = str( fields.caption );
	const cover = media?.kind === 'video' ? media.poster : media?.url;
	return (
		<div className={ `wots-ig${ caption ? '' : ' is-centered' }` }>
			<div className="wots-ig__frame">
				{ cover && (
					<img
						className="wots-ig__blur"
						src={ cover }
						alt=""
						aria-hidden="true"
					/>
				) }
				<MediaView media={ media } className="wots-ig__media" />
			</div>
			{ caption && (
				<div className="wots-ig__text">
					{ !! fields.username && (
						<div className="wots-ig__handle">
							{ str( fields.username ) }
						</div>
					) }
					<p className="wots-ig__caption">{ caption }</p>
					<div className="wots-ig__foot">
						{ !! fields.qr_code && (
							<Qr
								value={ str( fields.qr_code ) }
								className="wots-qr-card wots-ig__qr"
							/>
						) }
						<span>
							{ fields.qr_code
								? 'Scan to see it on Instagram'
								: '' }
							{ fields.posted ? (
								<>
									<br />
									{ str( fields.posted ) }
								</>
							) : null }
						</span>
					</div>
				</div>
			) }
		</div>
	);
}

/** List mode: the latest posts as a grid. */
export function InstagramList( {
	label,
	items,
}: {
	label: string;
	items: Array< Fields & { id: string } >;
} ) {
	const handle = str( items[ 0 ]?.username );
	return (
		<>
			<h2 className="wots-list-label">
				{ label ||
					`Latest on Instagram${ handle ? ` ${ handle }` : '' }` }
			</h2>
			<div className="wots-ig-grid">
				{ items.slice( 0, 8 ).map( ( item ) => (
					<MediaView
						key={ item.id }
						media={ item.media as MediaAsset | null }
						fit="cover"
						className="wots-ig-grid__item"
					/>
				) ) }
			</div>
		</>
	);
}

/**
 * The follower count, counting up (or down) to each new number. While on
 * screen it re-checks every 15 seconds, so a new follower in the shop sees
 * the number change.
 */
export function LiveFollowers( { initial }: { initial: number } ) {
	const [ shown, setShown ] = useState( initial );
	const [ bump, setBump ] = useState( 0 );
	const target = useRef( initial );
	const frame = useRef< number | undefined >( undefined );

	const animateTo = ( next: number ) => {
		const from = target.current;
		if ( next === from ) {
			return;
		}
		target.current = next;
		if ( next > from ) {
			setBump( next - from );
		}
		const start = performance.now();
		const step = ( now: number ) => {
			const t = Math.min( 1, ( now - start ) / COUNT_UP_MS );
			const eased = 1 - Math.pow( 1 - t, 3 );
			setShown( Math.round( from + ( next - from ) * eased ) );
			if ( t < 1 ) {
				frame.current = window.requestAnimationFrame( step );
			}
		};
		window.cancelAnimationFrame( frame.current ?? 0 );
		frame.current = window.requestAnimationFrame( step );
	};

	useEffect( () => {
		animateTo( initial );
	}, [ initial ] );

	useEffect( () => {
		const fetchCount = followerFetcher();
		if ( ! fetchCount ) {
			return;
		}
		let live = true;
		const check = () =>
			fetchCount()
				.then( ( r ) => {
					if ( live && typeof r.followers === 'number' ) {
						animateTo( r.followers );
					}
				} )
				.catch( () => {} );
		const timer = window.setInterval( check, FOLLOWER_POLL_MS );
		return () => {
			live = false;
			window.clearInterval( timer );
			window.cancelAnimationFrame( frame.current ?? 0 );
		};
	}, [] );

	useEffect( () => {
		if ( ! bump ) {
			return;
		}
		const t = window.setTimeout( () => setBump( 0 ), 4000 );
		return () => window.clearTimeout( t );
	}, [ bump ] );

	return (
		<span className="wots-followers">
			<span className="wots-followers__num">
				{ shown.toLocaleString() }
			</span>
			{ bump > 0 && (
				<span key={ target.current } className="wots-followers__bump">
					+{ bump }
				</span>
			) }
		</span>
	);
}

/** Built-in follower layout: "Follow us on Instagram" and the live count. */
export function FollowerCard( { fields }: { fields: Fields } ) {
	const photo = fields.profile_photo as ImageAsset | null;
	return (
		<div className="wots-fc">
			<div className="wots-fc__main">
				{ photo?.url && (
					<img className="wots-fc__photo" src={ photo.url } alt="" />
				) }
				<h1 className="wots-fc__title">Follow us on Instagram</h1>
				{ !! fields.username && (
					<div className="wots-fc__handle">
						{ str( fields.username ) }
					</div>
				) }
				<div className="wots-fc__count">
					<LiveFollowers
						initial={ Number( fields.followers ) || 0 }
					/>
					<span className="wots-fc__label">followers</span>
				</div>
			</div>
			{ !! fields.qr_code && (
				<div className="wots-fc__qr">
					<Qr
						value={ str( fields.qr_code ) }
						className="wots-qr-card"
					/>
					<span>Scan to follow</span>
				</div>
			) }
		</div>
	);
}
