import type { BlockStatus, BlockSummary, BlockType, Heartbeat } from './api';

export const TYPE_LABELS: Record< BlockType, string > = {
	static_image: 'Image',
	video: 'Video',
	dynamic_template: 'Dynamic',
};

const STATUS_LABELS: Record< BlockStatus, string > = {
	active: 'Active',
	scheduled: 'Scheduled',
	expired: 'Expired',
	archived: 'Archived',
};

export function StatusBadge( { status }: { status: BlockStatus } ) {
	return (
		<span className={ `wots-badge wots-badge--${ status }` }>
			{ STATUS_LABELS[ status ] ?? status }
		</span>
	);
}

export function Thumb( {
	block,
}: {
	block: Pick< BlockSummary, 'thumbnail' | 'type' | 'title' >;
} ) {
	if ( block.thumbnail ) {
		return <img className="wots-thumb" src={ block.thumbnail } alt="" />;
	}
	const icons: Record< string, string > = {
		video: 'video-alt3',
		dynamic_template: 'calendar-alt',
	};
	return (
		<span className="wots-thumb wots-thumb--empty" aria-hidden="true">
			<span
				className={ `dashicons dashicons-${ icons[ block.type ] ?? 'format-image' }` }
			/>
		</span>
	);
}

export function scheduleText(
	block: Pick< BlockSummary, 'start_date' | 'end_date' >
): string {
	const fmt = ( d: string ) =>
		new Date( `${ d }T12:00:00` ).toLocaleDateString( undefined, {
			month: 'short',
			day: 'numeric',
		} );
	if ( block.start_date && block.end_date ) {
		return `${ fmt( block.start_date ) } – ${ fmt( block.end_date ) }`;
	}
	if ( block.start_date ) {
		return `From ${ fmt( block.start_date ) }`;
	}
	if ( block.end_date ) {
		return `Until ${ fmt( block.end_date ) }`;
	}
	return 'Evergreen';
}

export function formatSeconds( total: number ): string {
	if ( total < 60 ) {
		return `${ total }s`;
	}
	const m = Math.floor( total / 60 );
	const s = total % 60;
	return s ? `${ m }m ${ s }s` : `${ m }m`;
}

export type PlayerHealth = 'online' | 'stale' | 'offline' | 'never';

export function playerHealth(
	hb: Heartbeat | null,
	now: number
): { health: PlayerHealth; text: string } {
	if ( ! hb ) {
		return { health: 'never', text: 'Shop player hasn’t checked in yet' };
	}
	const ago = Math.max( 0, now - hb.time );
	const mins = Math.round( ago / 60 );
	let agoText = `${ Math.round( mins / 60 ) } h ago`;
	if ( ago < 90 ) {
		agoText = 'just now';
	} else if ( mins < 60 ) {
		agoText = `${ mins } min ago`;
	}
	if ( ago <= 150 ) {
		return {
			health: hb.offline ? 'stale' : 'online',
			text: hb.offline
				? `Player can’t reach the site (seen ${ agoText })`
				: `Player online · seen ${ agoText }`,
		};
	}
	if ( ago <= 15 * 60 ) {
		return { health: 'stale', text: `Player last seen ${ agoText }` };
	}
	return { health: 'offline', text: `Player last seen ${ agoText }` };
}
