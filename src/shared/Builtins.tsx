/**
 * Built-in layouts for dynamic blocks without a template, ported from the
 * Next.js player (app/player/page.tsx) so the current show looks the same
 * after cutover. All sizes are stage pixels (1920×1080).
 */
import { Banner, QrColumn } from './Panel';
import type { Fields, ImageAsset } from './types';

const str = ( v: unknown ) =>
	v === null || v === undefined ? '' : String( v );

/** Text column + optional QR column. */
function CardBody( {
	qr,
	caption,
	children,
}: {
	qr: string;
	caption: string;
	children: React.ReactNode;
} ) {
	return (
		<div className="wots-card-row">
			<div className={ qr ? 'wots-card-text' : 'wots-card-text is-full' }>
				{ children }
			</div>
			{ qr && <QrColumn url={ qr } caption={ caption } /> }
		</div>
	);
}

export function EventCard( { fields }: { fields: Fields } ) {
	return (
		<>
			<Banner image={ fields.featured_image as ImageAsset | null } />
			<CardBody
				qr={ str( fields.qr_code ) }
				caption="Scan for event details"
			>
				<h1 className="wots-b-title">{ str( fields.title ) }</h1>
				{ !! fields.date_time && (
					<div className="wots-b-meta">
						{ str( fields.date_time ) }
					</div>
				) }
				{ !! fields.excerpt && (
					<p className="wots-b-body">{ str( fields.excerpt ) }</p>
				) }
			</CardBody>
		</>
	);
}

/** A regular WordPress post. */
export function PostCard( { fields }: { fields: Fields } ) {
	const meta = [ str( fields.date ), str( fields.categories ) ]
		.filter( Boolean )
		.join( ' · ' );
	return (
		<>
			<Banner image={ fields.featured_image as ImageAsset | null } />
			<CardBody qr={ str( fields.qr_code ) } caption="Scan to read more">
				<h1 className="wots-b-title">{ str( fields.title ) }</h1>
				{ meta && <div className="wots-b-meta">{ meta }</div> }
				{ !! fields.excerpt && (
					<p className="wots-b-body">{ str( fields.excerpt ) }</p>
				) }
			</CardBody>
		</>
	);
}

export function BulletinCard( { fields }: { fields: Fields } ) {
	return (
		<>
			<Banner image={ fields.featured_image as ImageAsset | null } />
			<CardBody qr={ str( fields.qr_code ) } caption="Scan to learn more">
				<h1 className="wots-b-title">{ str( fields.title ) }</h1>
				{ !! fields.organization && (
					<div className="wots-b-meta">
						{ str( fields.organization ) }
					</div>
				) }
				<p className="wots-b-body is-prewrap">{ str( fields.body ) }</p>
			</CardBody>
		</>
	);
}

function ReaderByline( {
	name,
	photo,
}: {
	name: string;
	photo: ImageAsset | null;
} ) {
	return (
		<div className="wots-byline">
			{ photo?.url && <img src={ photo.url } alt="" /> }
			<span>Recommended by { name }</span>
		</div>
	);
}

export function ReaderCard( { fields }: { fields: Fields } ) {
	return (
		<>
			<Banner image={ fields.book_cover as ImageAsset | null } />
			<CardBody
				qr={ str( fields.qr_code ) }
				caption="Scan to shop this book"
			>
				<h1 className="wots-b-title is-tight">
					{ str( fields.book_title ) }
				</h1>
				{ !! fields.book_author && (
					<div className="wots-b-meta">
						{ str( fields.book_author ) }
					</div>
				) }
				<ReaderByline
					name={ str( fields.reader_name ) }
					photo={ fields.reader_photo as ImageAsset | null }
				/>
				{ !! fields.blurb_html && (
					<div
						className="wots-b-body wots-b-html"
						dangerouslySetInnerHTML={ {
							__html: str( fields.blurb_html ),
						} }
					/>
				) }
			</CardBody>
		</>
	);
}

type ListItems = Array< Fields & { id: string } >;

function ListFrame( {
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
} ) {
	return (
		<>
			{ label && <h1 className="wots-list-label">{ label }</h1> }
			<div className="wots-list">{ children }</div>
		</>
	);
}

export function EventsList( {
	label,
	items,
}: {
	label: string;
	items: ListItems;
} ) {
	return (
		<ListFrame label={ label }>
			{ items.map( ( e ) => (
				<div key={ e.id } className="wots-list-row is-baseline">
					<div className="wots-list-when">{ str( e.date_time ) }</div>
					<div className="wots-list-title">{ str( e.title ) }</div>
				</div>
			) ) }
		</ListFrame>
	);
}

export function PostsList( {
	label,
	items,
}: {
	label: string;
	items: ListItems;
} ) {
	return (
		<ListFrame label={ label }>
			{ items.map( ( p ) => (
				<div key={ p.id } className="wots-list-row is-baseline">
					<div className="wots-list-when">{ str( p.date ) }</div>
					<div className="wots-list-title">{ str( p.title ) }</div>
				</div>
			) ) }
		</ListFrame>
	);
}

export function BulletinList( {
	label,
	items,
}: {
	label: string;
	items: ListItems;
} ) {
	return (
		<ListFrame label={ label }>
			{ items.map( ( b ) => (
				<div key={ b.id } className="wots-list-row">
					<div className="wots-list-org">{ str( b.title ) }</div>
					<div className="wots-list-body">{ str( b.body ) }</div>
				</div>
			) ) }
		</ListFrame>
	);
}

interface ReaderGroup {
	readerId: number;
	name: string;
	photo: ImageAsset | null;
	books: ListItems;
}

/**
 * Nest a reader-grouped list into one entry per reader (ported from
 * groupFormattedReaders()). The server already put each reader's books
 * next to each other.
 */
export function groupByReader( items: ListItems ): ReaderGroup[] {
	const groups: ReaderGroup[] = [];
	for ( const item of items ) {
		const readerId = Number( item.reader_id ?? 0 );
		const last = groups[ groups.length - 1 ];
		if ( last && last.readerId === readerId ) {
			last.books.push( item );
		} else {
			groups.push( {
				readerId,
				name: str( item.reader_name ),
				photo: ( item.reader_photo as ImageAsset | null ) ?? null,
				books: [ item ],
			} );
		}
	}
	return groups;
}

/** The "list of lists": each reader once, with their books under them. */
export function ReadersList( {
	label,
	items,
}: {
	label: string;
	items: ListItems;
} ) {
	return (
		<ListFrame label={ label }>
			{ groupByReader( items ).map( ( group ) => (
				<div key={ group.readerId } className="wots-reader-group">
					{ group.photo?.url && (
						<img src={ group.photo.url } alt="" />
					) }
					<div className="wots-reader-group__main">
						<div className="wots-list-reader">{ group.name }</div>
						{ group.books.map( ( book ) => (
							<div key={ book.id } className="wots-list-book">
								{ str( book.book_title ) }
								{ !! book.book_author && (
									<span> — { str( book.book_author ) }</span>
								) }
							</div>
						) ) }
					</div>
				</div>
			) ) }
		</ListFrame>
	);
}
