import {
	BaseControl,
	Button,
	CheckboxControl,
	ComboboxControl,
	Notice,
	RangeControl,
	SelectControl,
	TextControl,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import {
	adminConfig,
	getSourceTerms,
	previewSource,
	searchSourcePosts,
	type BlockRecord,
	type DataSourceInfo,
	type PickablePost,
	type TaxonomyTerms,
	type TemplateSummary,
} from './api';
import { MediaPicker } from './MediaPicker';

type Meta = BlockRecord[ 'meta' ];
type SetMeta = ( patch: Partial< Meta > ) => void;

/** Matches each data source's DEFAULT_MAX in PHP. */
const MAX_DEFAULTS: Record< string, string > = {
	events: '5',
	community_board: '10',
	featured_readers: '20',
	instagram: '6',
	posts: '5',
};

const int = ( v: string ) => Math.max( 0, parseInt( v, 10 ) || 0 );

/**
 * Data source, display mode, timing, template, and (Featured Readers)
 * month for a dynamic block (PRD §9.2).
 */
export function DynamicSettings( {
	meta,
	setMeta,
	dataSources,
	templates,
	itemDefault,
}: {
	meta: Meta;
	setMeta: SetMeta;
	dataSources: DataSourceInfo[];
	templates: TemplateSummary[];
	itemDefault: number;
} ) {
	const source = dataSources.find( ( s ) => s.key === meta._data_source );
	const single = !! source?.single;
	const isList = ! single && meta._display_mode === 'list';
	const isEvents = meta._data_source === 'events';
	const picked = meta._post_ids
		? meta._post_ids.split( ',' ).filter( Boolean )
		: [];
	const eventRange = isEvents ? meta._event_range || 'next' : 'next';
	const usable = templates.filter(
		( t ) => t.data_source === meta._data_source
	);

	return (
		<div className="wots-fieldset">
			<div className="wots-row">
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Data source"
					value={ meta._data_source }
					options={ dataSources.map( ( s ) => ( {
						value: s.key,
						label: s.available
							? s.label
							: `${ s.label } (not available)`,
					} ) ) }
					onChange={ ( v ) =>
						setMeta( { _data_source: v, _template_id: 0 } )
					}
				/>
				{ ! single && (
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Display"
						value={ meta._display_mode || 'carousel' }
						options={ [
							{
								value: 'carousel',
								label: 'Carousel: one item per slide',
							},
							{
								value: 'list',
								label: 'List: all items on one slide',
							},
						] }
						onChange={ ( v ) =>
							setMeta( {
								_display_mode: v as Meta[ '_display_mode' ],
							} )
						}
					/>
				) }
			</div>
			{ source && ! source.available && (
				<Notice status="warning" isDismissible={ false }>
					{ source.key.startsWith( 'instagram' )
						? 'Instagram isn’t connected yet. Connect it in Signage → Settings; until then this block is skipped.'
						: `${ source.label } isn’t available on this site (its plugin or post type is missing), so this block will be skipped.` }
				</Notice>
			) }

			{ isEvents && picked.length === 0 && (
				<EventRangeFields meta={ meta } setMeta={ setMeta } />
			) }

			<div className="wots-row">
				{ ! single && (
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						max={ 100 }
						label="Show up to"
						help={
							eventRange === 'next'
								? 'items'
								: 'Optional cap. Blank = every event in range.'
						}
						placeholder={
							eventRange === 'next' && ! picked.length
								? ( MAX_DEFAULTS[ meta._data_source ] ?? '10' )
								: 'All'
						}
						value={ String( meta._max_items || '' ) }
						onChange={ ( v ) =>
							setMeta( { _max_items: int( v ) } )
						}
					/>
				) }
				{ isList ? (
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						label="Seconds on screen"
						placeholder={ String( itemDefault ) }
						help={ `The whole list. Blank = ${ itemDefault }s` }
						value={
							meta._duration_seconds
								? String( meta._duration_seconds )
								: ''
						}
						onChange={ ( v ) =>
							setMeta( { _duration_seconds: int( v ) } )
						}
					/>
				) : (
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						label="Seconds per item"
						placeholder={ String( itemDefault ) }
						help={ `Blank = ${ itemDefault }s` }
						value={
							meta._per_item_duration
								? String( meta._per_item_duration )
								: ''
						}
						onChange={ ( v ) =>
							setMeta( { _per_item_duration: int( v ) } )
						}
					/>
				) }
			</div>

			{ isList ? (
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="List heading"
					help="Optional, e.g. “Coming Up at the Shop”."
					value={ meta._list_label }
					onChange={ ( v ) => setMeta( { _list_label: v } ) }
				/>
			) : (
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Layout"
					value={ String( meta._template_id || 0 ) }
					options={ [
						{ value: '0', label: 'Built-in layout' },
						...usable.map( ( t ) => ( {
							value: String( t.id ),
							label: t.title,
						} ) ),
					] }
					help={
						usable.length
							? 'Templates are built on the Templates tab.'
							: `No templates for ${ source?.label ?? 'this source' } yet. Build one on the Templates tab.`
					}
					onChange={ ( v ) => setMeta( { _template_id: int( v ) } ) }
				/>
			) }

			{ meta._data_source === 'featured_readers' &&
				picked.length === 0 && (
					<MonthField meta={ meta } setMeta={ setMeta } />
				) }

			{ source?.pick && (
				<PostPicker
					key={ source.key }
					sourceKey={ source.key }
					noun={ source.pick }
					value={ meta._post_ids }
					onChange={ ( v ) => setMeta( { _post_ids: v } ) }
				/>
			) }

			{ source && Object.keys( source.taxonomies ?? {} ).length > 0 && (
				<TermFilter
					sourceKey={ source.key }
					meta={ meta }
					setMeta={ setMeta }
				/>
			) }

			<MatchCount meta={ meta } />
		</div>
	);
}

/** What picking replaces, per source. */
const PICK_NOTES: Record< string, string > = {
	events: 'Picked events show soonest first, instead of “Which events”. Events that have ended drop off.',
	featured_readers:
		'Picked readers show their recommendations whatever their featured month, in the order picked.',
	community_board:
		'Picked postings still need to be approved and inside their dates.',
};

/**
 * "Only these …": hand-pick posts of the source's type by title (or ID).
 * Empty = the source chooses as usual.
 */
function PostPicker( {
	sourceKey,
	noun,
	value,
	onChange,
}: {
	sourceKey: string;
	noun: string;
	value: string;
	onChange: ( v: string ) => void;
} ) {
	const ids = value ? value.split( ',' ).filter( Boolean ) : [];
	const [ known, setKnown ] = useState< Record< string, PickablePost > >(
		{}
	);
	const [ results, setResults ] = useState< PickablePost[] >( [] );
	const [ search, setSearch ] = useState( '' );

	// Names for already-picked posts.
	useEffect( () => {
		const missing = ids.filter( ( id ) => ! known[ id ] );
		if ( ! missing.length ) {
			return;
		}
		searchSourcePosts( sourceKey, { include: missing.join( ',' ) } )
			.then( ( found ) =>
				setKnown( ( k ) => ( {
					...k,
					...Object.fromEntries(
						found.map( ( p ) => [ String( p.id ), p ] )
					),
				} ) )
			)
			.catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ value, sourceKey ] );

	// Search as you type (title, or an ID).
	useEffect( () => {
		let live = true;
		const t = window.setTimeout( () => {
			searchSourcePosts( sourceKey, { search } )
				.then( ( found ) => {
					if ( live ) {
						setResults( found );
						setKnown( ( k ) => ( {
							...k,
							...Object.fromEntries(
								found.map( ( p ) => [ String( p.id ), p ] )
							),
						} ) );
					}
				} )
				.catch( () => live && setResults( [] ) );
		}, 300 );
		return () => {
			live = false;
			window.clearTimeout( t );
		};
	}, [ search, sourceKey ] );

	const set = ( next: string[] ) => onChange( next.join( ',' ) );
	const move = ( i: number, delta: number ) => {
		const next = [ ...ids ];
		const [ id ] = next.splice( i, 1 );
		next.splice( i + delta, 0, id );
		set( next );
	};

	return (
		<fieldset className="wots-fieldset wots-picker">
			<legend>Only these { noun }</legend>
			<p className="wots-hint">
				Leave empty to choose { noun } automatically.{ ' ' }
				{ ids.length > 0 && ( PICK_NOTES[ sourceKey ] ?? '' ) }
			</p>
			{ ids.length > 0 && (
				<ol className="wots-picker__list">
					{ ids.map( ( id, i ) => {
						const post = known[ id ];
						return (
							<li key={ id }>
								<span className="wots-picker__title">
									{ post ? post.title : `#${ id }` }
									<span className="wots-subtle">
										{ ' ' }
										{ post
											? `${ post.date } · ID ${ id }${
													post.status !== 'publish'
														? ` · ${ post.status }`
														: ''
												}`
											: 'not found' }
									</span>
								</span>
								<Button
									size="small"
									icon="arrow-up-alt2"
									label="Move up"
									disabled={ i === 0 }
									onClick={ () => move( i, -1 ) }
								/>
								<Button
									size="small"
									icon="arrow-down-alt2"
									label="Move down"
									disabled={ i === ids.length - 1 }
									onClick={ () => move( i, 1 ) }
								/>
								<Button
									size="small"
									icon="no-alt"
									label="Remove"
									onClick={ () =>
										set( ids.filter( ( x ) => x !== id ) )
									}
								/>
							</li>
						);
					} ) }
				</ol>
			) }
			<ComboboxControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label={ `Add ${ noun }` }
				help="Type a title or an ID."
				value={ null }
				options={ results
					.filter( ( p ) => ! ids.includes( String( p.id ) ) )
					.map( ( p ) => ( {
						value: String( p.id ),
						label: `${ p.title } (${ p.date }, ID ${ p.id })`,
					} ) ) }
				onFilterValueChange={ setSearch }
				onChange={ ( v ) => {
					if ( v ) {
						set( [ ...ids, v ] );
					}
				} }
			/>
		</fieldset>
	);
}

const RANGE_OPTIONS = [
	{ value: 'next', label: 'The next few events' },
	{ value: 'days', label: 'Every event in the next … days' },
	{ value: 'month', label: 'Every event left this month' },
	{ value: 'dates', label: 'Every event between two dates' },
];

/**
 * Which events: the next N, or everything in a window. A busy month and
 * a quiet season both fill the screen sensibly.
 */
function EventRangeFields( {
	meta,
	setMeta,
}: {
	meta: Meta;
	setMeta: SetMeta;
} ) {
	const range = meta._event_range || 'next';
	return (
		<div className="wots-row">
			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Which events"
				value={ range }
				options={ RANGE_OPTIONS }
				onChange={ ( v ) =>
					setMeta( {
						_event_range: v as Meta[ '_event_range' ],
						// "Show up to 5" made sense for "next few"; a range
						// usually wants everything.
						_max_items:
							v === 'next' || range !== 'next'
								? meta._max_items
								: 0,
					} )
				}
			/>
			{ range === 'days' && (
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					type="number"
					min={ 1 }
					max={ 366 }
					label="Days ahead"
					placeholder="30"
					help="Including today. Blank = 30."
					value={ meta._range_days ? String( meta._range_days ) : '' }
					onChange={ ( v ) => setMeta( { _range_days: int( v ) } ) }
				/>
			) }
			{ range === 'dates' && (
				<>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="date"
						label="From"
						help="Blank = today"
						value={ meta._range_start }
						onChange={ ( v ) => setMeta( { _range_start: v } ) }
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="date"
						label="To"
						help="Blank = no end"
						value={ meta._range_end }
						onChange={ ( v ) => setMeta( { _range_end: v } ) }
					/>
				</>
			) }
		</div>
	);
}

function parseFilter( json: string ): Record< string, number[] > {
	try {
		const v = JSON.parse( json || '{}' );
		return v && typeof v === 'object' && ! Array.isArray( v ) ? v : {};
	} catch {
		return {};
	}
}

/**
 * "Only show items in…": the source's own categories, tags, etc. Within a
 * taxonomy any ticked term matches; across taxonomies all must match.
 */
function TermFilter( {
	sourceKey,
	meta,
	setMeta,
}: {
	sourceKey: string;
	meta: Meta;
	setMeta: SetMeta;
} ) {
	const [ groups, setGroups ] = useState< TaxonomyTerms[] | null >( null );
	const filter = parseFilter( meta._term_filter );

	useEffect( () => {
		let live = true;
		setGroups( null );
		getSourceTerms( sourceKey )
			.then( ( g ) => live && setGroups( g ) )
			.catch( () => live && setGroups( [] ) );
		return () => {
			live = false;
		};
	}, [ sourceKey ] );

	const toggle = ( taxonomy: string, id: number, on: boolean ) => {
		const current = filter[ taxonomy ] ?? [];
		const next = {
			...filter,
			[ taxonomy ]: on
				? [ ...current, id ]
				: current.filter( ( x ) => x !== id ),
		};
		Object.keys( next ).forEach( ( k ) => {
			if ( ! next[ k ].length ) {
				delete next[ k ];
			}
		} );
		setMeta( {
			_term_filter: Object.keys( next ).length
				? JSON.stringify( next )
				: '',
		} );
	};

	const withTerms = ( groups ?? [] ).filter( ( g ) => g.terms.length > 0 );
	if ( groups && withTerms.length === 0 ) {
		return null;
	}

	return (
		<fieldset className="wots-fieldset wots-filter">
			<legend>Only show items in…</legend>
			<p className="wots-hint">
				Nothing ticked = everything. Tick more than one to include any
				of them.
			</p>
			{ ! groups && <p className="wots-subtle">Loading…</p> }
			{ withTerms.map( ( g ) => (
				<div key={ g.taxonomy } className="wots-filter__group">
					<strong>{ g.label }</strong>
					<div className="wots-checks wots-filter__terms">
						{ g.terms.map( ( t ) => (
							<CheckboxControl
								key={ t.id }
								__nextHasNoMarginBottom
								label={ `${ t.name } (${ t.count })` }
								checked={ (
									filter[ g.taxonomy ] ?? []
								).includes( t.id ) }
								onChange={ ( on ) =>
									toggle( g.taxonomy, t.id, on )
								}
							/>
						) ) }
					</div>
				</div>
			) ) }
		</fieldset>
	);
}

/** "N items match right now" for the block's current choices. */
function MatchCount( { meta }: { meta: Meta } ) {
	const [ count, setCount ] = useState< number | null >( null );
	const key = meta._data_source;
	const deps = [
		key,
		meta._event_range,
		meta._range_days,
		meta._range_start,
		meta._range_end,
		meta._term_filter,
		meta._max_items,
		meta._featured_month_year,
		meta._post_ids,
	].join( '|' );

	useEffect( () => {
		let live = true;
		const t = window.setTimeout( () => {
			previewSource( key, {
				monthYear: meta._featured_month_year,
				max: meta._max_items || 100,
				meta,
			} )
				.then( ( r ) => live && setCount( r.items.length ) )
				.catch( () => live && setCount( null ) );
		}, 400 );
		return () => {
			live = false;
			window.clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the meta that matters.
	}, [ deps ] );

	if ( count === null || ! key ) {
		return null;
	}
	return (
		<p className="wots-match">
			{ count === 0
				? 'Nothing matches right now, so this block will be skipped.'
				: `${ count } item${ count === 1 ? '' : 's' } match right now.` }
		</p>
	);
}

/**
 * Featured Readers "Month & Year": blank = current month. The match count
 * below the fields makes a typo obvious right away.
 */
function MonthField( { meta, setMeta }: { meta: Meta; setMeta: SetMeta } ) {
	return (
		<TextControl
			__next40pxDefaultSize
			__nextHasNoMarginBottom
			label="Month & Year"
			placeholder="Current month"
			help="Blank = whatever month it is. Or pin a month, e.g. “September 2025”."
			value={ meta._featured_month_year }
			onChange={ ( v ) => setMeta( { _featured_month_year: v } ) }
		/>
	);
}

function ColorField( {
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: ( v: string ) => void;
} ) {
	const id = `wots-color-${ label.replace( /\W+/g, '-' ).toLowerCase() }`;
	return (
		<BaseControl __nextHasNoMarginBottom id={ id } label={ label }>
			<div className="wots-color">
				<input
					id={ id }
					type="color"
					value={ value || '#ffffff' }
					onChange={ ( e ) => onChange( e.target.value ) }
				/>
				<code>{ value }</code>
			</div>
		</BaseControl>
	);
}

/**
 * Background image behind the panel, panel tint, and text colors (ported
 * from the Next.js block settings).
 */
export function PanelSettings( {
	meta,
	setMeta,
}: {
	meta: Meta;
	setMeta: SetMeta;
} ) {
	return (
		<fieldset className="wots-fieldset">
			<legend>Look</legend>
			<BaseControl
				__nextHasNoMarginBottom
				id="wots-bg"
				label="Background image"
				help="Fills the screen behind the panel. A template set to use each item’s own image shows that instead, when the item has one."
			>
				<MediaPicker
					kind="image"
					value={ meta._bg_image_id }
					onChange={ ( id ) => setMeta( { _bg_image_id: id } ) }
				/>
				{ meta._bg_image_id > 0 && (
					<button
						type="button"
						className="button-link wots-remove-link"
						onClick={ () => setMeta( { _bg_image_id: 0 } ) }
					>
						Remove background
					</button>
				) }
			</BaseControl>
			<div className="wots-row">
				<ColorField
					label="Panel color"
					value={ meta._panel_color }
					onChange={ ( v ) => setMeta( { _panel_color: v } ) }
				/>
				<RangeControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Panel opacity"
					min={ 0 }
					max={ 100 }
					value={ meta._panel_opacity }
					onChange={ ( v ) => setMeta( { _panel_opacity: v ?? 60 } ) }
				/>
			</div>
			<div className="wots-row wots-row--3">
				<ColorField
					label="Title"
					value={ meta._title_color }
					onChange={ ( v ) => setMeta( { _title_color: v } ) }
				/>
				<ColorField
					label="Body"
					value={ meta._body_color }
					onChange={ ( v ) => setMeta( { _body_color: v } ) }
				/>
				<ColorField
					label="Date / meta"
					value={ meta._meta_color }
					onChange={ ( v ) => setMeta( { _meta_color: v } ) }
				/>
			</div>
		</fieldset>
	);
}

const TRANSITION_LABELS: Record< string, string > = {
	cut: 'Cut',
	crossfade: 'Crossfade',
	slide: 'Slide',
	zoom: 'Zoom',
};
const ANIMATION_LABELS: Record< string, string > = {
	none: 'None',
	fade: 'Fade',
	slide: 'Slide up',
	zoom: 'Zoom',
};

/** Block transition (every type) and content animation (dynamic only). */
export function MotionSettings( {
	meta,
	setMeta,
	dynamic,
}: {
	meta: Meta;
	setMeta: SetMeta;
	dynamic: boolean;
} ) {
	const { settings } = adminConfig();
	return (
		<div className="wots-row">
			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Transition in"
				value={ meta._transition }
				options={ [
					{
						value: '',
						label: `Default (${ TRANSITION_LABELS[ settings.block_transition ] ?? settings.block_transition })`,
					},
					...Object.entries( TRANSITION_LABELS ).map(
						( [ value, label ] ) => ( { value, label } )
					),
				] }
				onChange={ ( v ) => setMeta( { _transition: v } ) }
			/>
			{ dynamic && (
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Content animation"
					value={ meta._content_animation }
					options={ [
						{
							value: '',
							label: `Default (${ ANIMATION_LABELS[ settings.content_animation ] ?? settings.content_animation })`,
						},
						...Object.entries( ANIMATION_LABELS ).map(
							( [ value, label ] ) => ( { value, label } )
						),
					] }
					onChange={ ( v ) => setMeta( { _content_animation: v } ) }
				/>
			) }
		</div>
	);
}
