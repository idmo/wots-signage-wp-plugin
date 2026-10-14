import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	Button,
	CheckboxControl,
	Dropdown,
	Modal,
	Notice,
	SelectControl,
	TextControl,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import type {
	BlockSummary,
	FitMode,
	Period,
	ShowSummary,
	TimelineData,
	TimelineItem,
} from './api';
import { MediaPicker } from './MediaPicker';

const DAYS = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
/** Week view and day buttons start on Monday. */
const WEEK = [ 1, 2, 3, 4, 5, 6, 0 ];

const newId = ( prefix: string ) =>
	prefix + Math.random().toString( 36 ).slice( 2, 10 );

interface Props {
	data: TimelineData;
	shows: ShowSummary[];
	blocks: BlockSummary[];
	saving: boolean;
	onChange: ( items: TimelineItem[] ) => void;
	onSavePeriods: ( periods: Period[] ) => Promise< void >;
	onEditShow: ( id: number ) => void;
	onEditBlock: ( id: number ) => void;
	onPreviewBlock: ( id: number ) => void;
}

/**
 * What the TV plays: one list, top to bottom, then it repeats. Items can be
 * limited to periods (named times of the week); untagged items always play.
 */
export function TimelineScreen( props: Props ) {
	const { data, saving, onChange } = props;
	const [ breakEdit, setBreakEdit ] = useState< TimelineItem | null >( null );
	const items = data.items;
	const playing = items.filter( ( i ) => i.active );

	const sensors = useSensors(
		useSensor( PointerSensor, { activationConstraint: { distance: 4 } } ),
		useSensor( KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		} )
	);

	const onDragEnd = ( { active, over }: DragEndEvent ) => {
		if ( ! over || active.id === over.id ) {
			return;
		}
		const ids = items.map( ( i ) => i.id );
		onChange(
			arrayMove(
				items,
				ids.indexOf( String( active.id ) ),
				ids.indexOf( String( over.id ) )
			)
		);
	};

	const update = ( id: string, patch: Partial< TimelineItem > ) =>
		onChange(
			items.map( ( i ) => ( i.id === id ? { ...i, ...patch } : i ) )
		);

	const saveBreak = ( item: TimelineItem ) => {
		const exists = items.some( ( i ) => i.id === item.id );
		onChange(
			exists
				? items.map( ( i ) => ( i.id === item.id ? item : i ) )
				: [ ...items, item ]
		);
		setBreakEdit( null );
	};

	return (
		<>
			<section className="wots-lineup wots-timeline">
				<div className="wots-lineup__head">
					<h2>Timeline</h2>
					<p className="wots-hint wots-hint--inline">
						The TV plays these top to bottom, then starts over. Tag
						an item with periods to play it only at those times.
						Drag to reorder.
						{ saving && ' Saving…' }
					</p>
				</div>

				{ items.length === 0 && (
					<Notice status="warning" isDismissible={ false }>
						The timeline is empty, so the TV shows a blank screen.
					</Notice>
				) }
				{ items.length > 0 && playing.length === 0 && (
					<Notice status="warning" isDismissible={ false }>
						Nothing on the timeline is in one of its periods right
						now, so the TV shows a blank screen.
					</Notice>
				) }

				<DndContext
					sensors={ sensors }
					collisionDetection={ closestCenter }
					onDragEnd={ onDragEnd }
				>
					<SortableContext
						items={ items.map( ( i ) => i.id ) }
						strategy={ verticalListSortingStrategy }
					>
						<ol className="wots-lineup__list">
							{ items.map( ( item, i ) => (
								<TimelineRow
									key={ item.id }
									item={ item }
									position={ i + 1 }
									periods={ data.periods }
									onPeriods={ ( periods ) =>
										update( item.id, { periods } )
									}
									onRemove={ () =>
										onChange(
											items.filter(
												( x ) => x.id !== item.id
											)
										)
									}
									onEdit={ () => {
										if ( item.kind === 'show' ) {
											props.onEditShow(
												item.show_id ?? 0
											);
										} else if ( item.kind === 'block' ) {
											props.onEditBlock(
												item.block_id ?? 0
											);
										} else {
											setBreakEdit( item );
										}
									} }
									onPreview={
										item.kind === 'block'
											? () =>
													props.onPreviewBlock(
														item.block_id ?? 0
													)
											: undefined
									}
								/>
							) ) }
						</ol>
					</SortableContext>
				</DndContext>

				<AddBar
					shows={ props.shows }
					blocks={ props.blocks }
					onAdd={ ( item ) => onChange( [ ...items, item ] ) }
					onAddBreak={ () =>
						setBreakEdit( {
							id: newId( 'b' ),
							kind: 'break',
							image_id: 0,
							seconds: 15,
							fit: 'contain-blur',
							label: '',
							periods: [],
						} )
					}
				/>
			</section>

			<PeriodsPanel
				periods={ data.periods }
				onSave={ props.onSavePeriods }
			/>

			<WeekView data={ data } />

			{ breakEdit && (
				<BreakModal
					item={ breakEdit }
					onClose={ () => setBreakEdit( null ) }
					onSave={ saveBreak }
				/>
			) }
		</>
	);
}

function TimelineRow( {
	item,
	position,
	periods,
	onPeriods,
	onRemove,
	onEdit,
	onPreview,
}: {
	item: TimelineItem;
	position: number;
	periods: Period[];
	onPeriods: ( ids: string[] ) => void;
	onRemove: () => void;
	onEdit: () => void;
	onPreview?: () => void;
} ) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable( { id: item.id } );
	const tagged = periods.filter( ( p ) => item.periods.includes( p.id ) );

	return (
		<li
			ref={ setNodeRef }
			style={ {
				transform: CSS.Transform.toString( transform ),
				transition,
			} }
			className={ `wots-lineup__row wots-timeline__row is-${ item.kind }${ isDragging ? ' is-dragging' : '' }${ item.active ? '' : ' is-waiting' }` }
		>
			<button
				type="button"
				className="wots-handle wots-lineup__handle"
				aria-label={ `Reorder ${ item.title }` }
				{ ...attributes }
				{ ...listeners }
			>
				⋮⋮
			</button>
			<span className="wots-lineup__pos">{ position }</span>
			{ item.thumb ? (
				<img className="wots-thumb" src={ item.thumb } alt="" />
			) : (
				<span className={ `wots-thumb wots-timeline__icon` }>
					{ item.kind === 'show' ? '▶' : '■' }
				</span>
			) }
			<span className="wots-lineup__name wots-timeline__name">
				<Button variant="link" onClick={ onEdit }>
					{ item.title || '(untitled)' }
				</Button>
				<span className="wots-subtle">{ item.detail }</span>
			</span>
			<span className="wots-timeline__chips">
				{ tagged.length === 0 ? (
					<span className="wots-tag is-always">Always</span>
				) : (
					tagged.map( ( p ) => (
						<span
							key={ p.id }
							className={ `wots-tag${ p.active ? ' is-on' : '' }` }
						>
							{ p.name }
						</span>
					) )
				) }
				<Dropdown
					popoverProps={ { placement: 'bottom-end' } }
					renderToggle={ ( { isOpen, onToggle } ) => (
						<Button
							size="small"
							variant="tertiary"
							onClick={ onToggle }
							aria-expanded={ isOpen }
						>
							When…
						</Button>
					) }
					renderContent={ () => (
						<div className="wots-timeline__when">
							{ periods.length === 0 ? (
								<p className="wots-hint">
									Add periods below (like “Weekday mornings”)
									to limit when this plays.
								</p>
							) : (
								<>
									<p className="wots-hint">
										Play only during (none ticked = always):
									</p>
									{ periods.map( ( p ) => (
										<CheckboxControl
											__nextHasNoMarginBottom
											key={ p.id }
											label={ p.name }
											help={ describePeriod( p ) }
											checked={ item.periods.includes(
												p.id
											) }
											onChange={ ( on ) =>
												onPeriods(
													on
														? [
																...item.periods,
																p.id,
															]
														: item.periods.filter(
																( x ) =>
																	x !== p.id
															)
												)
											}
										/>
									) ) }
								</>
							) }
						</div>
					) }
				/>
			</span>
			<span
				className={ `wots-badge${ item.active ? ' wots-badge--active' : '' }` }
			>
				{ item.active ? 'Playing' : 'Waiting' }
			</span>
			{ onPreview && (
				<Button size="small" variant="tertiary" onClick={ onPreview }>
					Preview
				</Button>
			) }
			<Button
				size="small"
				variant="tertiary"
				isDestructive
				onClick={ onRemove }
				aria-label={ `Remove ${ item.title } from the timeline` }
			>
				Remove
			</Button>
		</li>
	);
}

function AddBar( {
	shows,
	blocks,
	onAdd,
	onAddBreak,
}: {
	shows: ShowSummary[];
	blocks: BlockSummary[];
	onAdd: ( item: TimelineItem ) => void;
	onAddBreak: () => void;
} ) {
	const [ showId, setShowId ] = useState( '' );
	const [ blockId, setBlockId ] = useState( '' );
	const usable = blocks.filter( ( b ) => b.post_status !== 'trash' );

	return (
		<div className="wots-timeline__add">
			<div className="wots-timeline__add-group">
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Add a show"
					value={ showId }
					options={ [
						{ value: '', label: 'Choose a show…' },
						...shows.map( ( s ) => ( {
							value: String( s.id ),
							label: `${ s.title } (${ s.count })`,
						} ) ),
					] }
					onChange={ setShowId }
				/>
				<Button
					variant="secondary"
					disabled={ ! showId }
					onClick={ () => {
						onAdd( {
							id: newId( 's' ),
							kind: 'show',
							show_id: Number( showId ),
							periods: [],
						} );
						setShowId( '' );
					} }
				>
					Add
				</Button>
			</div>
			<div className="wots-timeline__add-group">
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Add a block (video, slideshow…)"
					value={ blockId }
					options={ [
						{ value: '', label: 'Choose a block…' },
						...usable.map( ( b ) => ( {
							value: String( b.id ),
							label: b.title,
						} ) ),
					] }
					onChange={ setBlockId }
				/>
				<Button
					variant="secondary"
					disabled={ ! blockId }
					onClick={ () => {
						onAdd( {
							id: newId( 'k' ),
							kind: 'block',
							block_id: Number( blockId ),
							periods: [],
						} );
						setBlockId( '' );
					} }
				>
					Add
				</Button>
			</div>
			<div className="wots-timeline__add-group">
				<Button variant="secondary" onClick={ onAddBreak }>
					Add a break (still image)
				</Button>
			</div>
		</div>
	);
}

function BreakModal( {
	item,
	onClose,
	onSave,
}: {
	item: TimelineItem;
	onClose: () => void;
	onSave: ( item: TimelineItem ) => void;
} ) {
	const [ draft, setDraft ] = useState( item );
	return (
		<Modal title="Break" onRequestClose={ onClose } size="medium">
			<p className="wots-hint">
				A still image — artwork, your logo — held on screen for a set
				time. No block needed.
			</p>
			<MediaPicker
				kind="image"
				value={ draft.image_id ?? 0 }
				onChange={ ( id ) => setDraft( { ...draft, image_id: id } ) }
			/>
			<div className="wots-row">
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Label (admin only)"
					value={ draft.label ?? '' }
					placeholder="Break"
					onChange={ ( label ) => setDraft( { ...draft, label } ) }
				/>
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					type="number"
					min={ 1 }
					max={ 3600 }
					label="Seconds on screen"
					value={ String( draft.seconds ?? 15 ) }
					onChange={ ( v ) =>
						setDraft( { ...draft, seconds: Number( v ) || 1 } )
					}
				/>
			</div>
			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Fit"
				value={ draft.fit ?? 'contain-blur' }
				options={ [
					{ value: 'cover', label: 'Fill the screen (crop edges)' },
					{ value: 'contain', label: 'Fit inside (black bars)' },
					{
						value: 'contain-blur',
						label: 'Fit inside (blurred background)',
					},
				] }
				onChange={ ( fit ) =>
					setDraft( { ...draft, fit: fit as FitMode } )
				}
			/>
			<div className="wots-modal-actions">
				<Button variant="tertiary" onClick={ onClose }>
					Cancel
				</Button>
				<Button
					variant="primary"
					disabled={ ! draft.image_id }
					onClick={ () => onSave( draft ) }
				>
					{ item.title ? 'Save break' : 'Add to timeline' }
				</Button>
			</div>
		</Modal>
	);
}

// --- Periods -----------------------------------------------------------------

/** "Mon–Fri · 9:00am–12:00pm · Oct 25 – Oct 31" */
export function describePeriod( p: Period ): string {
	const parts: string[] = [];
	const days = [ ...p.days ].sort(
		( a, b ) => WEEK.indexOf( a ) - WEEK.indexOf( b )
	);
	if ( days.length === 7 ) {
		parts.push( 'Every day' );
	} else if ( days.join() === '1,2,3,4,5' ) {
		parts.push( 'Weekdays' );
	} else if ( days.join() === '6,0' ) {
		parts.push( 'Weekends' );
	} else {
		parts.push( days.map( ( d ) => DAYS[ d ] ).join( ', ' ) );
	}
	if ( p.start || p.end ) {
		parts.push(
			`${ clock( p.start || '00:00' ) }–${ clock( p.end || '24:00' ) }`
		);
	} else {
		parts.push( 'all day' );
	}
	if ( p.from || p.until ) {
		parts.push(
			`${ p.from ? shortDate( p.from ) : '…' } – ${
				p.until ? shortDate( p.until ) : '…'
			}`
		);
	}
	return parts.join( ' · ' );
}

function clock( hhmm: string ): string {
	const [ h, m ] = hhmm.split( ':' ).map( Number );
	if ( h === 24 || ( h === 0 && m === 0 && hhmm === '24:00' ) ) {
		return 'midnight';
	}
	const suffix = h < 12 ? 'am' : 'pm';
	return `${ h % 12 || 12 }:${ String( m ).padStart( 2, '0' ) }${ suffix }`;
}

function shortDate( ymd: string ): string {
	const d = new Date( `${ ymd }T12:00:00` );
	return d.toLocaleDateString( undefined, {
		month: 'short',
		day: 'numeric',
	} );
}

function PeriodsPanel( {
	periods,
	onSave,
}: {
	periods: Period[];
	onSave: ( periods: Period[] ) => Promise< void >;
} ) {
	const [ draft, setDraft ] = useState( periods );
	const [ saving, setSaving ] = useState( false );
	useEffect( () => setDraft( periods ), [ periods ] );

	const dirty =
		JSON.stringify( draft.map( strip ) ) !==
		JSON.stringify( periods.map( strip ) );

	const set = ( id: string, patch: Partial< Period > ) =>
		setDraft(
			draft.map( ( p ) => ( p.id === id ? { ...p, ...patch } : p ) )
		);

	const save = async () => {
		setSaving( true );
		try {
			await onSave( draft );
		} finally {
			setSaving( false );
		}
	};

	return (
		<section className="wots-lineup wots-periods">
			<div className="wots-lineup__head">
				<h2>Periods</h2>
				<p className="wots-hint wots-hint--inline">
					Named times you can tag timeline items with. An end time
					before the start runs past midnight. Leave both times empty
					for all day.
				</p>
			</div>

			{ draft.map( ( p ) => (
				<div className="wots-period" key={ p.id }>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						className="wots-period__name"
						label="Name"
						value={ p.name }
						onChange={ ( name ) => set( p.id, { name } ) }
					/>
					<fieldset className="wots-period__days">
						<legend>Days</legend>
						{ WEEK.map( ( d ) => {
							const on = p.days.includes( d );
							return (
								<Button
									key={ d }
									size="small"
									variant={ on ? 'primary' : 'secondary' }
									aria-pressed={ on }
									onClick={ () =>
										set( p.id, {
											days: on
												? p.days.filter(
														( x ) => x !== d
													)
												: [ ...p.days, d ],
										} )
									}
								>
									{ DAYS[ d ] }
								</Button>
							);
						} ) }
					</fieldset>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="time"
						label="From"
						value={ p.start }
						onChange={ ( start ) => set( p.id, { start } ) }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="time"
						label="To"
						value={ p.end }
						onChange={ ( end ) => set( p.id, { end } ) }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="date"
						label="Starting (optional)"
						value={ p.from }
						onChange={ ( from ) => set( p.id, { from } ) }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="date"
						label="Ending (optional)"
						value={ p.until }
						onChange={ ( until ) => set( p.id, { until } ) }
					/>
					<span className="wots-period__summary wots-subtle">
						{ describePeriod( {
							...p,
							days: p.days.length
								? p.days
								: [ 0, 1, 2, 3, 4, 5, 6 ],
						} ) }
						{ p.active && ! dirty && (
							<span className="wots-badge wots-badge--active">
								On now
							</span>
						) }
						<span className="wots-spacer" />
						<Button
							size="small"
							variant="tertiary"
							isDestructive
							onClick={ () =>
								setDraft(
									draft.filter( ( x ) => x.id !== p.id )
								)
							}
						>
							Delete
						</Button>
					</span>
				</div>
			) ) }

			<div className="wots-modal-actions wots-periods__actions">
				<Button
					variant="secondary"
					onClick={ () =>
						setDraft( [
							...draft,
							{
								id: newId( 'p' ),
								name: '',
								days: [ 1, 2, 3, 4, 5 ],
								start: '09:00',
								end: '17:00',
								from: '',
								until: '',
							},
						] )
					}
				>
					Add period
				</Button>
				<span className="wots-spacer" />
				{ dirty && (
					<Button
						variant="tertiary"
						onClick={ () => setDraft( periods ) }
					>
						Discard changes
					</Button>
				) }
				<Button
					variant="primary"
					disabled={ ! dirty || saving }
					isBusy={ saving }
					onClick={ save }
				>
					Save periods
				</Button>
			</div>
		</section>
	);
}

const strip = ( { active, week, ...rest }: Period ) => rest;

// --- Week view -----------------------------------------------------------------

/**
 * When each timeline item plays in a typical week (date ranges aside), with
 * a line at the current time.
 */
function WeekView( { data }: { data: TimelineData } ) {
	const byId = new Map( data.periods.map( ( p ) => [ p.id, p ] ) );
	if ( ! data.items.length ) {
		return null;
	}
	const nowPct = ( data.now.minutes / 1440 ) * 100;

	return (
		<section className="wots-lineup wots-week">
			<div className="wots-lineup__head">
				<h2>Week at a glance</h2>
				<p className="wots-hint wots-hint--inline">
					Each bar is one day, midnight to midnight. Periods with
					start or end dates only apply between them.
				</p>
			</div>
			<div
				className="wots-week__grid"
				role="table"
				aria-label="When each timeline item plays"
			>
				<div className="wots-week__row is-head" role="row">
					<span role="columnheader" />
					{ WEEK.map( ( d ) => (
						<span
							role="columnheader"
							key={ d }
							className={
								d === data.now.day ? 'is-today' : undefined
							}
						>
							{ DAYS[ d ] }
						</span>
					) ) }
				</div>
				{ data.items.map( ( item ) => {
					const tagged = item.periods
						.map( ( id ) => byId.get( id ) )
						.filter( Boolean ) as Period[];
					return (
						<div
							className="wots-week__row"
							role="row"
							key={ item.id }
						>
							<span
								role="rowheader"
								className="wots-week__label"
								title={ item.title }
							>
								{ item.title }
							</span>
							{ WEEK.map( ( d ) => {
								const spans: Array< [ number, number ] > =
									tagged.length
										? tagged.flatMap(
												( p ) => p.week?.[ d ] ?? []
											)
										: [ [ 0, 1440 ] ];
								return (
									<span
										role="cell"
										key={ d }
										className="wots-week__day"
										aria-label={
											spans.length
												? spans
														.map(
															( [ a, b ] ) =>
																`${ clock(
																	mm( a )
																) }–${ clock(
																	mm( b )
																) }`
														)
														.join( ', ' )
												: 'off'
										}
									>
										{ spans.map( ( [ a, b ], i ) => (
											<span
												key={ i }
												className={ `wots-week__span${ tagged.length ? '' : ' is-always' }` }
												style={ {
													left: `${
														( a / 1440 ) * 100
													}%`,
													width: `${
														( ( b - a ) / 1440 ) *
														100
													}%`,
												} }
											/>
										) ) }
										{ d === data.now.day && (
											<span
												className="wots-week__now"
												style={ {
													left: `${ nowPct }%`,
												} }
											/>
										) }
									</span>
								);
							} ) }
						</div>
					);
				} ) }
			</div>
		</section>
	);
}

const mm = ( minutes: number ) =>
	`${ Math.floor( minutes / 60 ) }:${ String( minutes % 60 ).padStart(
		2,
		'0'
	) }`;
