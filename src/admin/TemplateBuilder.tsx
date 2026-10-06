import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCorners,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
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
	RangeControl,
	Notice,
	SelectControl,
	TextControl,
	TextareaControl,
	ToggleControl,
} from '@wordpress/components';
import {
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { PanelBackground, PanelBox, itemBackground } from '../shared/Panel';
import { Stage } from '../shared/Stage';
import { TemplateSlide } from '../shared/TemplateSlide';
import {
	MAX_COLS,
	MAX_ROWS,
	TEMPLATE_LAYOUTS,
	clampSplit,
	evenSplit,
	gridStyle,
	layoutRegions,
	presetAsGrid,
	regionLabel,
	type LayoutId,
} from '../shared/templates';
import {
	DEFAULT_DESIGN,
	type GridRow,
	type ElementPlacement,
	type Fields,
	type PanelStyle,
	type TemplateDesign,
} from '../shared/types';
import {
	adminConfig,
	deleteLayout,
	deleteTemplate,
	getLayouts,
	previewSource,
	saveLayout,
	saveTemplate,
	type DataSourceInfo,
	type SavedLayout,
	type TemplateRecord,
} from './api';
import { LayoutThumb } from './LayoutThumb';

type Placements = Record< string, ElementPlacement[] >;

interface Props {
	initial: TemplateRecord;
	dataSources: DataSourceInfo[];
	usedBy: number;
	onClose: () => void;
	onSaved: ( id: number ) => void;
	onDeleted: () => void;
}

/** Keep placements that fit the layout; move orphans into its first region. */
function fitToLayout(
	placements: Placements,
	layout: LayoutId,
	design?: Pick< TemplateDesign, 'rows' >
): Placements {
	const regions = layoutRegions( layout, design );
	const out: Placements = {};
	regions.forEach( ( r ) => ( out[ r ] = [ ...( placements[ r ] ?? [] ) ] ) );
	Object.entries( placements ).forEach( ( [ r, list ] ) => {
		if ( ! regions.includes( r ) ) {
			out[ regions[ 0 ] ].push( ...list );
		}
	} );
	return out;
}

/**
 * Drag-and-drop Template Builder (PRD §7), ported into wp-admin. Elements
 * from the data source's palette are dragged into the layout's regions;
 * the preview underneath renders a real item with the same renderer the
 * player uses.
 */
export function TemplateBuilder( {
	initial,
	dataSources,
	usedBy,
	onClose,
	onSaved,
	onDeleted,
}: Props ) {
	const [ title, setTitle ] = useState( initial.title );
	const [ source, setSource ] = useState( initial.data_source );
	const [ layout, setLayout ] = useState< LayoutId >( initial.layout );
	const [ design, setDesign ] = useState< TemplateDesign >( {
		...DEFAULT_DESIGN,
		...initial.design,
	} );
	const [ placements, setPlacements ] = useState< Placements >(
		fitToLayout( initial.placements, initial.layout, {
			rows: initial.design?.rows ?? [],
		} )
	);
	const [ selectedRegion, setSelectedRegion ] = useState< string >(
		layoutRegions( initial.layout, initial.design )[ 0 ]
	);
	const [ saved, setSaved ] = useState< SavedLayout[] >( [] );

	useEffect( () => {
		getLayouts()
			.then( setSaved )
			.catch( () => {} );
	}, [] );
	const [ dragLabel, setDragLabel ] = useState< string | null >( null );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ dirty, setDirty ] = useState( false );

	const sourceInfo = dataSources.find( ( s ) => s.key === source );
	const palette = useMemo( () => sourceInfo?.elements ?? [], [ sourceInfo ] );
	const types = useMemo(
		() => Object.fromEntries( palette.map( ( e ) => [ e.key, e.type ] ) ),
		[ palette ]
	);
	const labels = useMemo(
		() => Object.fromEntries( palette.map( ( e ) => [ e.key, e.label ] ) ),
		[ palette ]
	);

	const update = ( next: Placements ) => {
		setPlacements( next );
		setDirty( true );
	};

	const updateDesign = ( patch: Partial< TemplateDesign > ) => {
		setDesign( ( d ) => ( { ...d, ...patch } ) );
		setDirty( true );
	};

	const imageElements = palette.filter( ( e ) => e.type === 'image' );

	const changeLayout = ( next: LayoutId ) => {
		if ( next === 'custom' && layout !== 'custom' ) {
			// Start the grid from the current preset, keeping what's placed.
			const { rows, map } = presetAsGrid( layout, design );
			applyRows( rows, map );
			return;
		}
		setLayout( next );
		update( fitToLayout( placements, next, design ) );
		setSelectedRegion( layoutRegions( next, design )[ 0 ] );
	};

	/**
	 * Switch to (or reshape) the custom grid. `map` renames zones, e.g.
	 * when a preset becomes a grid; zones that disappear hand their
	 * elements to the first zone.
	 */
	const applyRows = (
		rows: GridRow[],
		map: Record< string, string > = {}
	) => {
		const renamed: Placements = {};
		Object.entries( placements ).forEach( ( [ r, list ] ) => {
			const to = map[ r ] ?? r;
			renamed[ to ] = [ ...( renamed[ to ] ?? [] ), ...list ];
		} );
		setLayout( 'custom' );
		updateDesign( { rows } );
		update( fitToLayout( renamed, 'custom', { rows } ) );
		setSelectedRegion( ( cur ) => {
			const zones = layoutRegions( 'custom', { rows } );
			return zones.includes( map[ cur ] ?? cur )
				? ( map[ cur ] ?? cur )
				: zones[ 0 ];
		} );
	};

	const changeSource = ( next: string ) => {
		const allowed = new Set(
			( dataSources.find( ( s ) => s.key === next )?.elements ?? [] ).map(
				( e ) => e.key
			)
		);
		const kept: Placements = {};
		Object.entries( placements ).forEach(
			( [ r, list ] ) =>
				( kept[ r ] = list.filter( ( p ) => allowed.has( p.element ) ) )
		);
		setSource( next );
		update( kept );
		// The background element belongs to the old source.
		if ( design.background && ! allowed.has( design.background ) ) {
			updateDesign( { background: '' } );
		}
	};

	const addTo = ( region: string, key: string, index?: number ) => {
		const list = [ ...( placements[ region ] ?? [] ) ];
		list.splice( index ?? list.length, 0, {
			element: key,
			// New "Text" elements start with a common call to action.
			options:
				key === 'free_text'
					? { text: 'Scan for details', role: 'meta' }
					: {},
		} );
		update( { ...placements, [ region ]: list } );
	};

	const removeAt = ( region: string, index: number ) => {
		update( {
			...placements,
			[ region ]: placements[ region ].filter( ( _, i ) => i !== index ),
		} );
	};

	const setOptions = (
		region: string,
		index: number,
		options: ElementPlacement[ 'options' ]
	) => {
		update( {
			...placements,
			[ region ]: placements[ region ].map( ( p, i ) =>
				i === index ? { ...p, options } : p
			),
		} );
	};

	// --- Drag and drop ------------------------------------------------------

	const sensors = useSensors(
		useSensor( PointerSensor, { activationConstraint: { distance: 4 } } ),
		useSensor( KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		} )
	);

	const onDragStart = ( e: DragStartEvent ) => {
		const data = e.active.data.current as { key: string } | undefined;
		setDragLabel( data ? ( labels[ data.key ] ?? data.key ) : null );
	};

	const onDragEnd = ( e: DragEndEvent ) => {
		setDragLabel( null );
		const from = e.active.data.current as {
			from: 'palette' | 'region';
			key: string;
			region?: string;
			index?: number;
		};
		const over = e.over?.data.current as
			{ region: string; index?: number } | undefined;
		if ( ! from || ! over ) {
			return;
		}
		const targetIndex =
			over.index ?? placements[ over.region ]?.length ?? 0;

		if ( from.from === 'palette' ) {
			addTo( over.region, from.key, targetIndex );
			return;
		}
		if ( from.region === undefined || from.index === undefined ) {
			return;
		}
		if ( from.region === over.region ) {
			if ( over.index === undefined || over.index === from.index ) {
				return;
			}
			update( {
				...placements,
				[ from.region ]: arrayMove(
					placements[ from.region ],
					from.index,
					over.index
				),
			} );
			return;
		}
		const moving = placements[ from.region ][ from.index ];
		const remaining = placements[ from.region ].filter(
			( _, i ) => i !== from.index
		);
		const target = [ ...( placements[ over.region ] ?? [] ) ];
		target.splice( targetIndex, 0, moving );
		update( {
			...placements,
			[ from.region ]: remaining,
			[ over.region ]: target,
		} );
	};

	// --- Save ---------------------------------------------------------------

	const save = async () => {
		if ( ! title.trim() ) {
			setError( 'Give the template a name.' );
			return;
		}
		setSaving( true );
		setError( '' );
		try {
			const res = await saveTemplate( {
				id: initial.id,
				title: title.trim(),
				data_source: source,
				layout,
				placements,
				design,
			} );
			setDirty( false );
			onSaved( res.id );
		} catch ( err ) {
			setError( ( err as Error ).message );
		} finally {
			setSaving( false );
		}
	};

	const remove = async () => {
		if ( ! initial.id ) {
			return;
		}
		setSaving( true );
		try {
			await deleteTemplate( initial.id );
			onDeleted();
		} catch ( err ) {
			setError( ( err as Error ).message );
			setSaving( false );
		}
	};

	const usedKeys = new Set(
		Object.values( placements )
			.flat()
			.map( ( p ) => p.element )
	);

	return (
		<div className="wots-builder">
			<div className="wots-builder__bar">
				<Button variant="tertiary" onClick={ onClose }>
					← All templates
				</Button>
				<span className="wots-spacer" />
				{ dirty && (
					<span className="wots-subtle">Unsaved changes</span>
				) }
				{ initial.id && (
					<Button
						variant="tertiary"
						isDestructive
						disabled={ saving || usedBy > 0 }
						onClick={ remove }
						label={
							usedBy > 0
								? `Used by ${ usedBy } block${ usedBy === 1 ? '' : 's' }`
								: undefined
						}
						showTooltip={ usedBy > 0 }
					>
						Delete
					</Button>
				) }
				<Button
					variant="primary"
					onClick={ save }
					isBusy={ saving }
					disabled={ saving }
				>
					{ initial.id ? 'Save template' : 'Create template' }
				</Button>
			</div>

			{ error && (
				<Notice status="error" onRemove={ () => setError( '' ) }>
					{ error }
				</Notice>
			) }

			<div className="wots-builder__grid">
				<div className="wots-builder__side">
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Name"
						value={ title }
						onChange={ ( v ) => {
							setTitle( v );
							setDirty( true );
						} }
					/>
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Data source"
						value={ source }
						options={ dataSources.map( ( s ) => ( {
							value: s.key,
							label: s.label,
						} ) ) }
						onChange={ changeSource }
						help={
							usedBy > 0
								? 'Changing this unlinks it from blocks using another source.'
								: undefined
						}
					/>
					<div
						className="wots-layouts"
						role="radiogroup"
						aria-label="Layout"
					>
						{ ( Object.keys( TEMPLATE_LAYOUTS ) as LayoutId[] )
							.filter( ( id ) => id !== 'custom' )
							.map( ( id ) => (
								<button
									key={ id }
									type="button"
									role="radio"
									aria-checked={ layout === id }
									className={ `wots-layout-pick${ layout === id ? ' is-selected' : '' }` }
									onClick={ () => changeLayout( id ) }
								>
									<LayoutThumb layout={ id } />
									<span>
										{ TEMPLATE_LAYOUTS[ id ].label }
									</span>
								</button>
							) ) }
						{ saved.map( ( l ) => (
							<div key={ l.id } className="wots-layout-saved">
								<button
									type="button"
									role="radio"
									aria-checked={ false }
									className="wots-layout-pick"
									onClick={ () => applyRows( l.rows ) }
								>
									<LayoutThumb
										layout="custom"
										design={ { rows: l.rows } }
									/>
									<span>{ l.name }</span>
								</button>
								<Button
									size="small"
									icon="no-alt"
									label={ `Delete saved layout “${ l.name }”` }
									showTooltip
									onClick={ () =>
										deleteLayout( l.id ).then( setSaved )
									}
								/>
							</div>
						) ) }
						<button
							type="button"
							role="radio"
							aria-checked={ layout === 'custom' }
							className={ `wots-layout-pick${ layout === 'custom' ? ' is-selected' : '' }` }
							onClick={ () => changeLayout( 'custom' ) }
						>
							<LayoutThumb layout="custom" design={ design } />
							<span>Custom grid</span>
						</button>
					</div>

					{ layout === 'custom' && (
						<GridEditor
							rows={
								design.rows.length
									? design.rows
									: [ { h: 100, cols: [ 100 ] } ]
							}
							onChange={ ( rows ) => applyRows( rows ) }
							onSave={ ( name ) =>
								saveLayout( name, design.rows ).then( setSaved )
							}
						/>
					) }

					{ layout !== 'full' && layout !== 'custom' && (
						<>
							<RangeControl
								__next40pxDefaultSize
								__nextHasNoMarginBottom
								label="First column width (%)"
								help="Or drag the handles between regions."
								min={ 15 }
								max={ 85 }
								value={ design.col }
								onChange={ ( v ) =>
									updateDesign( { col: clampSplit( v ) } )
								}
							/>
							<RangeControl
								__next40pxDefaultSize
								__nextHasNoMarginBottom
								label="First row height (%)"
								min={ 15 }
								max={ 85 }
								value={ design.row }
								onChange={ ( v ) =>
									updateDesign( { row: clampSplit( v ) } )
								}
							/>
						</>
					) }

					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Full-screen background"
						value={ design.background }
						options={ [
							{
								value: '',
								label: 'Block’s background image',
							},
							...imageElements.map( ( e ) => ( {
								value: e.key,
								label: `Each item’s ${ e.label }`,
							} ) ),
						] }
						help={
							design.background
								? 'Changes with every item. Items without one fall back to the block’s background image.'
								: 'Set per block, in the block’s Look settings.'
						}
						onChange={ ( v ) => updateDesign( { background: v } ) }
					/>
					{ design.background && (
						<RangeControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label="Darken background (%)"
							help="Helps text stay readable over busy photos."
							min={ 0 }
							max={ 90 }
							step={ 5 }
							value={ design.dim }
							onChange={ ( v ) =>
								updateDesign( { dim: v ?? 0 } )
							}
						/>
					) }

					<h3 className="wots-builder__subhead">Spacing</h3>
					<RangeControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Panel padding"
						help="Space between the panel’s edge and its content. 0 = edge to edge."
						min={ 0 }
						max={ 160 }
						step={ 4 }
						value={ design.inset }
						onChange={ ( v ) => updateDesign( { inset: v ?? 0 } ) }
					/>
					<RangeControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Space between zones"
						min={ 0 }
						max={ 120 }
						step={ 4 }
						value={ design.gap }
						onChange={ ( v ) => updateDesign( { gap: v ?? 0 } ) }
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label="Fill the screen"
						help="The panel covers the whole screen, with square corners."
						checked={ design.fill }
						onChange={ ( v ) => updateDesign( { fill: v } ) }
					/>
				</div>

				<DndContext
					sensors={ sensors }
					collisionDetection={ closestCorners }
					onDragStart={ onDragStart }
					onDragEnd={ onDragEnd }
				>
					<div className="wots-builder__main">
						<div className="wots-palette">
							<h3>Elements</h3>
							<p className="wots-hint">
								Drag into a region, or select a region and click
								an element to add it there.
							</p>
							<div className="wots-palette__chips">
								{ palette.map( ( el ) => (
									<PaletteChip
										key={ el.key }
										elKey={ el.key }
										label={ el.label }
										hint={ el.hint }
										used={ usedKeys.has( el.key ) }
										onAdd={ () =>
											addTo( selectedRegion, el.key )
										}
									/>
								) ) }
							</div>
						</div>

						<RegionGrid
							layout={ layout }
							design={ design }
							onResize={ updateDesign }
							renderRegion={ ( r, style ) => (
								<RegionBox
									key={ r }
									region={ r }
									style={ style }
									selected={ selectedRegion === r }
									onSelect={ () => setSelectedRegion( r ) }
									items={ placements[ r ] ?? [] }
									labels={ labels }
									types={ types }
									onRemove={ ( i ) => removeAt( r, i ) }
									onOptions={ ( i, o ) =>
										setOptions( r, i, o )
									}
								/>
							) }
						/>
					</div>
					<DragOverlay>
						{ dragLabel ? (
							<span className="wots-chip is-overlay">
								{ dragLabel }
							</span>
						) : null }
					</DragOverlay>
				</DndContext>
			</div>

			<TemplatePreview
				source={ source }
				layout={ layout }
				placements={ placements }
				design={ design }
				types={ types }
			/>
		</div>
	);
}

/**
 * The builder's regions in the template's proportions, with drag handles
 * on the column and row splits. Handles also work with the arrow keys.
 */
function RegionGrid( {
	layout,
	design,
	onResize,
	renderRegion,
}: {
	layout: LayoutId;
	design: TemplateDesign;
	onResize: ( patch: Partial< TemplateDesign > ) => void;
	renderRegion: (
		region: string,
		style?: React.CSSProperties
	) => React.ReactNode;
} ) {
	const ref = useRef< HTMLDivElement | null >( null );
	if ( layout === 'custom' ) {
		return (
			<CustomRegionGrid
				rows={
					design.rows.length
						? design.rows
						: [ { h: 100, cols: [ 100 ] } ]
				}
				onResize={ ( rows ) => onResize( { rows } ) }
				renderRegion={ renderRegion }
			/>
		);
	}
	const style = gridStyle( layout, design );
	const { col, row } = design;

	const drag =
		( axis: 'col' | 'row' ) => ( e: React.PointerEvent< HTMLElement > ) => {
			const box = ref.current?.getBoundingClientRect();
			if ( ! box ) {
				return;
			}
			e.preventDefault();
			const target = e.currentTarget;
			target.setPointerCapture( e.pointerId );
			const move = ( ev: PointerEvent ) => {
				const pct =
					axis === 'col'
						? ( ( ev.clientX - box.left ) / box.width ) * 100
						: ( ( ev.clientY - box.top ) / box.height ) * 100;
				onResize( { [ axis ]: clampSplit( pct ) } );
			};
			const up = () => {
				target.removeEventListener( 'pointermove', move );
				target.removeEventListener( 'pointerup', up );
			};
			target.addEventListener( 'pointermove', move );
			target.addEventListener( 'pointerup', up );
		};

	const keys =
		( axis: 'col' | 'row' ) =>
		( e: React.KeyboardEvent< HTMLElement > ) => {
			const back = axis === 'col' ? 'ArrowLeft' : 'ArrowUp';
			const fwd = axis === 'col' ? 'ArrowRight' : 'ArrowDown';
			if ( e.key !== back && e.key !== fwd ) {
				return;
			}
			e.preventDefault();
			const step = ( e.shiftKey ? 5 : 1 ) * ( e.key === fwd ? 1 : -1 );
			onResize( { [ axis ]: clampSplit( design[ axis ] + step ) } );
		};

	// Where each handle sits (and how far it runs) for this layout.
	let colSpan = { top: '0%', bottom: '0%' };
	let rowSpan = { left: '0%', right: '0%' };
	if ( layout === 'stack' ) {
		colSpan = { top: `${ row }%`, bottom: '0%' };
	} else if ( layout === 'split_left' ) {
		rowSpan = { left: '0%', right: `${ 100 - col }%` };
	} else if ( layout === 'split_right' ) {
		rowSpan = { left: `${ col }%`, right: '0%' };
	}

	return (
		<div className="wots-regions" ref={ ref } style={ style }>
			{ layoutRegions( layout, design ).map( ( r ) =>
				renderRegion( r, { gridArea: r } )
			) }
			{ layout !== 'full' && (
				<>
					<button
						type="button"
						className="wots-split wots-split--col"
						style={ { left: `${ col }%`, ...colSpan } }
						aria-label={ `Column split, ${ col }%. Use arrow keys to resize.` }
						title="Drag to resize the columns"
						onPointerDown={ drag( 'col' ) }
						onKeyDown={ keys( 'col' ) }
					/>
					<button
						type="button"
						className="wots-split wots-split--row"
						style={ { top: `${ row }%`, ...rowSpan } }
						aria-label={ `Row split, ${ row }%. Use arrow keys to resize.` }
						title="Drag to resize the rows"
						onPointerDown={ drag( 'row' ) }
						onKeyDown={ keys( 'row' ) }
					/>
				</>
			) }
		</div>
	);
}

/**
 * Move the divider between two neighbours (sizes in percent) so the first
 * ends at `at` percent of the whole; each keeps at least 5%.
 */
function moveDivider( sizes: number[], index: number, at: number ): number[] {
	const before = sizes.slice( 0, index ).reduce( ( a, b ) => a + b, 0 );
	const pair = sizes[ index ] + sizes[ index + 1 ];
	const first = Math.min(
		pair - 5,
		Math.max( 5, Math.round( at - before ) )
	);
	const next = [ ...sizes ];
	next[ index ] = first;
	next[ index + 1 ] = pair - first;
	return next;
}

/**
 * The custom grid in the builder: rows of zones with a draggable divider
 * between neighbouring zones and between rows. Dividers also take the
 * arrow keys (Shift for bigger steps).
 */
function CustomRegionGrid( {
	rows,
	onResize,
	renderRegion,
}: {
	rows: GridRow[];
	onResize: ( rows: GridRow[] ) => void;
	renderRegion: (
		region: string,
		style?: React.CSSProperties
	) => React.ReactNode;
} ) {
	const ref = useRef< HTMLDivElement | null >( null );

	/** Pointer-drag a divider; `measure` gives the percent along its axis. */
	const drag =
		(
			measure: ( ev: PointerEvent, target: HTMLElement ) => number,
			apply: ( at: number ) => void
		) =>
		( e: React.PointerEvent< HTMLElement > ) => {
			e.preventDefault();
			const target = e.currentTarget;
			target.setPointerCapture( e.pointerId );
			const move = ( ev: PointerEvent ) => apply( measure( ev, target ) );
			const up = () => {
				target.removeEventListener( 'pointermove', move );
				target.removeEventListener( 'pointerup', up );
			};
			target.addEventListener( 'pointermove', move );
			target.addEventListener( 'pointerup', up );
		};

	const keys =
		(
			back: string,
			fwd: string,
			current: number,
			apply: ( at: number ) => void
		) =>
		( e: React.KeyboardEvent< HTMLElement > ) => {
			if ( e.key !== back && e.key !== fwd ) {
				return;
			}
			e.preventDefault();
			apply(
				current + ( e.shiftKey ? 5 : 1 ) * ( e.key === fwd ? 1 : -1 )
			);
		};

	const setRowHeights = ( i: number, at: number ) =>
		onResize(
			( () => {
				const h = moveDivider(
					rows.map( ( r ) => r.h ),
					i,
					at
				);
				return rows.map( ( r, k ) => ( { ...r, h: h[ k ] } ) );
			} )()
		);

	const setColWidths = ( r: number, i: number, at: number ) =>
		onResize(
			rows.map( ( row, k ) =>
				k === r ? { ...row, cols: moveDivider( row.cols, i, at ) } : row
			)
		);

	const edge = ( sizes: number[], i: number ) =>
		sizes.slice( 0, i + 1 ).reduce( ( a, b ) => a + b, 0 );

	return (
		<div className="wots-regions is-custom" ref={ ref }>
			{ rows.map( ( row, r ) => (
				<Fragment key={ r }>
					<div
						className="wots-regions__row"
						style={ { flex: `${ row.h } 1 0` } }
					>
						{ row.cols.map( ( w, c ) => (
							<Fragment key={ c }>
								{ renderRegion( `r${ r + 1 }c${ c + 1 }`, {
									flex: `${ w } 1 0`,
								} ) }
								{ c < row.cols.length - 1 && (
									<button
										type="button"
										className="wots-divider is-col"
										aria-label={ `Row ${ r + 1 }: divider after zone ${ c + 1 }, ${ edge( row.cols, c ) }%. Use arrow keys to resize.` }
										title="Drag to resize these zones"
										onPointerDown={ drag(
											( ev, t ) => {
												const box = (
													t.parentElement as HTMLElement
												 ).getBoundingClientRect();
												return (
													( ( ev.clientX -
														box.left ) /
														box.width ) *
													100
												);
											},
											( at ) => setColWidths( r, c, at )
										) }
										onKeyDown={ keys(
											'ArrowLeft',
											'ArrowRight',
											edge( row.cols, c ),
											( at ) => setColWidths( r, c, at )
										) }
									/>
								) }
							</Fragment>
						) ) }
					</div>
					{ r < rows.length - 1 && (
						<button
							type="button"
							className="wots-divider is-row"
							aria-label={ `Divider after row ${ r + 1 }, ${ edge(
								rows.map( ( x ) => x.h ),
								r
							) }%. Use arrow keys to resize.` }
							title="Drag to resize these rows"
							onPointerDown={ drag(
								( ev ) => {
									const box =
										ref.current?.getBoundingClientRect();
									return box
										? ( ( ev.clientY - box.top ) /
												box.height ) *
												100
										: 0;
								},
								( at ) => setRowHeights( r, at )
							) }
							onKeyDown={ keys(
								'ArrowUp',
								'ArrowDown',
								edge(
									rows.map( ( x ) => x.h ),
									r
								),
								( at ) => setRowHeights( r, at )
							) }
						/>
					) }
				</Fragment>
			) ) }
		</div>
	);
}

/**
 * Rows and zones of the custom grid: add or remove rows, set how many
 * zones each row has (up to 4 × 4), and save the arrangement by name.
 */
function GridEditor( {
	rows,
	onChange,
	onSave,
}: {
	rows: GridRow[];
	onChange: ( rows: GridRow[] ) => void;
	onSave: ( name: string ) => Promise< unknown >;
} ) {
	const [ name, setName ] = useState( '' );
	const [ savedNote, setSavedNote ] = useState( '' );

	const setCount = ( r: number, count: number ) =>
		onChange(
			rows.map( ( row, k ) =>
				k === r ? { ...row, cols: evenSplit( count ) } : row
			)
		);
	const addRow = () => {
		const h = evenSplit( rows.length + 1 );
		onChange( [
			...rows.map( ( row, k ) => ( { ...row, h: h[ k ] } ) ),
			{ h: h[ rows.length ], cols: [ 100 ] },
		] );
	};
	const removeRow = ( r: number ) => {
		const left = rows.filter( ( _, k ) => k !== r );
		const h = evenSplit( left.length );
		onChange( left.map( ( row, k ) => ( { ...row, h: h[ k ] } ) ) );
	};

	return (
		<div className="wots-grid-editor">
			<h3 className="wots-builder__subhead">Grid</h3>
			<ol className="wots-grid-editor__rows">
				{ rows.map( ( row, r ) => (
					<li key={ r }>
						<span>Row { r + 1 }</span>
						<Button
							size="small"
							icon="minus"
							label={ `Fewer zones in row ${ r + 1 }` }
							disabled={ row.cols.length <= 1 }
							onClick={ () => setCount( r, row.cols.length - 1 ) }
						/>
						<span className="wots-grid-editor__count">
							{ row.cols.length } zone
							{ row.cols.length === 1 ? '' : 's' }
						</span>
						<Button
							size="small"
							icon="plus"
							label={ `More zones in row ${ r + 1 }` }
							disabled={ row.cols.length >= MAX_COLS }
							onClick={ () => setCount( r, row.cols.length + 1 ) }
						/>
						<Button
							size="small"
							icon="no-alt"
							label={ `Remove row ${ r + 1 }` }
							disabled={ rows.length <= 1 }
							onClick={ () => removeRow( r ) }
						/>
					</li>
				) ) }
			</ol>
			<Button
				variant="secondary"
				size="small"
				disabled={ rows.length >= MAX_ROWS }
				onClick={ addRow }
			>
				Add row
			</Button>
			<p className="wots-hint">
				Drag the dividers between zones to resize them. Elements in a
				removed zone move to the first zone.
			</p>
			<div className="wots-grid-editor__save">
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Save this grid as a layout"
					placeholder="e.g. Banner + 3 columns"
					value={ name }
					onChange={ ( v ) => {
						setName( v );
						setSavedNote( '' );
					} }
				/>
				<Button
					variant="secondary"
					disabled={ ! name.trim() }
					onClick={ () =>
						onSave( name.trim() ).then( () => {
							setSavedNote( `Saved “${ name.trim() }”.` );
							setName( '' );
						} )
					}
				>
					Save layout
				</Button>
			</div>
			{ savedNote && <p className="wots-subtle">{ savedNote }</p> }
		</div>
	);
}

function PaletteChip( {
	elKey,
	label,
	hint,
	used,
	onAdd,
}: {
	elKey: string;
	label: string;
	hint?: string;
	used: boolean;
	onAdd: () => void;
} ) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable( {
		id: `palette:${ elKey }`,
		data: { from: 'palette', key: elKey },
	} );
	return (
		<button
			ref={ setNodeRef }
			type="button"
			className={ `wots-chip${ used ? ' is-used' : '' }${ isDragging ? ' is-dragging' : '' }` }
			title={ hint }
			onClick={ onAdd }
			{ ...attributes }
			{ ...listeners }
		>
			{ label }
		</button>
	);
}

function RegionBox( {
	region,
	style,
	selected,
	onSelect,
	items,
	labels,
	types,
	onRemove,
	onOptions,
}: {
	region: string;
	style?: React.CSSProperties;
	selected: boolean;
	onSelect: () => void;
	items: ElementPlacement[];
	labels: Record< string, string >;
	types: Record< string, string >;
	onRemove: ( index: number ) => void;
	onOptions: (
		index: number,
		options: ElementPlacement[ 'options' ]
	) => void;
} ) {
	const { setNodeRef, isOver } = useDroppable( {
		id: `region:${ region }`,
		data: { region },
	} );
	const ids = items.map( ( _, i ) => `${ region }:${ i }` );
	return (
		// Mouse convenience: click anywhere in a region to select it. The
		// region's label button is the keyboard path.
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
		<div
			ref={ setNodeRef }
			className={ `wots-region${ selected ? ' is-selected' : '' }${ isOver ? ' is-over' : '' }` }
			style={ style }
			onClick={ ( e ) => {
				// Clicks on placed elements and their buttons don't select.
				if ( ! ( e.target as HTMLElement ).closest( '.wots-placed' ) ) {
					onSelect();
				}
			} }
		>
			<button
				type="button"
				className="wots-region__label"
				aria-pressed={ selected }
				title="Select this region, then click elements to add them here"
				onClick={ onSelect }
			>
				{ regionLabel( region ) }
			</button>
			<SortableContext
				items={ ids }
				strategy={ verticalListSortingStrategy }
			>
				{ items.map( ( p, i ) => (
					<PlacedElement
						key={ ids[ i ] }
						id={ ids[ i ] }
						region={ region }
						index={ i }
						placement={ p }
						label={ labels[ p.element ] ?? p.element }
						type={ types[ p.element ] ?? 'text' }
						onRemove={ () => onRemove( i ) }
						onOptions={ ( o ) => onOptions( i, o ) }
					/>
				) ) }
			</SortableContext>
			{ items.length === 0 && (
				<div className="wots-region__empty">Drop elements here</div>
			) }
		</div>
	);
}

const SIZES: Array< [ string, string ] > = [
	[ 's', 'S' ],
	[ 'm', 'M' ],
	[ 'l', 'L' ],
	[ 'xl', 'XL' ],
];

function PlacedElement( {
	id,
	region,
	index,
	placement,
	label,
	type,
	onRemove,
	onOptions,
}: {
	id: string;
	region: string;
	index: number;
	placement: ElementPlacement;
	label: string;
	type: string;
	onRemove: () => void;
	onOptions: ( o: ElementPlacement[ 'options' ] ) => void;
} ) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable( {
		id,
		data: { from: 'region', key: placement.element, region, index },
	} );
	const opts = placement.options ?? {};
	const set = ( patch: Partial< ElementPlacement[ 'options' ] > ) =>
		onOptions( { ...opts, ...patch } );
	const isText = type === 'static';

	return (
		<div
			ref={ setNodeRef }
			style={ {
				transform: CSS.Transform.toString( transform ),
				transition,
			} }
			className={ `wots-placed${ isDragging ? ' is-dragging' : '' }` }
		>
			<button
				type="button"
				className="wots-handle"
				aria-label={ `Move ${ label }` }
				{ ...attributes }
				{ ...listeners }
			>
				⋮⋮
			</button>
			<span className="wots-placed__label">
				{ isText ? `Text: ${ opts.text || '(empty)' }` : label }
			</span>
			<span className="wots-placed__opts">
				{ ( type === 'text' ||
					type === 'html' ||
					type === 'followers' ||
					isText ) && (
					<span className="wots-seg" role="group" aria-label="Size">
						{ SIZES.map( ( [ v, l ] ) => (
							<button
								key={ v }
								type="button"
								aria-pressed={ ( opts.size ?? 'm' ) === v }
								onClick={ () =>
									set( { size: v as 's' | 'm' | 'l' | 'xl' } )
								}
							>
								{ l }
							</button>
						) ) }
					</span>
				) }
				{ ( type === 'image' || type === 'media' ) && (
					<span
						className="wots-seg"
						role="group"
						aria-label="Image fit"
					>
						{ [ 'cover', 'contain' ].map( ( v ) => (
							<button
								key={ v }
								type="button"
								aria-pressed={ ( opts.fit ?? 'cover' ) === v }
								onClick={ () =>
									set( { fit: v as 'cover' | 'contain' } )
								}
							>
								{ v === 'cover' ? 'Fill' : 'Fit' }
							</button>
						) ) }
					</span>
				) }
				{ type !== 'image' && type !== 'media' && (
					<span
						className="wots-seg"
						role="group"
						aria-label="Alignment"
					>
						{ [ 'left', 'center', 'right' ].map( ( v ) => (
							<button
								key={ v }
								type="button"
								aria-pressed={
									( opts.align ??
										( type === 'qr'
											? 'center'
											: 'left' ) ) === v
								}
								onClick={ () =>
									set( {
										align: v as 'left' | 'center' | 'right',
									} )
								}
								aria-label={ `Align ${ v }` }
							>
								<span
									className={ `dashicons dashicons-editor-align${ v }` }
								/>
							</button>
						) ) }
					</span>
				) }
			</span>
			<button
				type="button"
				className="wots-placed__remove"
				aria-label={ `Remove ${ label }` }
				onClick={ onRemove }
			>
				×
			</button>
			{ isText && (
				<div className="wots-placed__text">
					<span className="wots-placed__style">
						<span className="wots-subtle">Style like</span>
						<span
							className="wots-seg"
							role="group"
							aria-label="Text style"
						>
							{ (
								[
									[ 'title', 'Heading' ],
									[ 'meta', 'Detail' ],
									[ 'body', 'Body' ],
								] as const
							 ).map( ( [ v, l ] ) => (
								<button
									key={ v }
									type="button"
									aria-pressed={
										( opts.role ?? 'meta' ) === v
									}
									onClick={ () => set( { role: v } ) }
								>
									{ l }
								</button>
							) ) }
						</span>
					</span>
					<TextareaControl
						__nextHasNoMarginBottom
						label="Text"
						hideLabelFromVision
						rows={ 2 }
						value={ opts.text ?? '' }
						onChange={ ( v ) => set( { text: v } ) }
						onKeyDown={ ( e ) => e.stopPropagation() }
					/>
				</div>
			) }
		</div>
	);
}

/** Live preview with a real item from the data source. */
function TemplatePreview( {
	source,
	layout,
	placements,
	design,
	types,
}: {
	source: string;
	layout: LayoutId;
	placements: Placements;
	design: TemplateDesign;
	types: Record< string, string >;
} ) {
	const [ items, setItems ] = useState<
		Array< { id: string; fields: Fields } >
	>( [] );
	const [ index, setIndex ] = useState( 0 );
	const [ loading, setLoading ] = useState( true );
	const { settings, stage } = adminConfig();

	useEffect( () => {
		let live = true;
		setLoading( true );
		previewSource( source )
			.then( ( r ) => {
				if ( live ) {
					setItems( r.items );
					setIndex( 0 );
				}
			} )
			.catch( () => live && setItems( [] ) )
			.finally( () => live && setLoading( false ) );
		return () => {
			live = false;
		};
	}, [ source ] );

	const panel: PanelStyle = {
		background: null,
		color: settings.brand_color,
		opacity: 90,
		title: '#ffffff',
		body: '#ffffff',
		meta: '#ffffff',
		animation: 'none',
		animation_ms: 0,
	};
	const item = items[ index ];
	const template = { layout, regions: placements, design };
	const bg = itemBackground( template, item?.fields );

	return (
		<div className="wots-tpl-preview">
			<div className="wots-tpl-preview__bar">
				<h3>Preview</h3>
				{ items.length > 1 && (
					<>
						<Button
							size="small"
							variant="tertiary"
							onClick={ () =>
								setIndex(
									( index + items.length - 1 ) % items.length
								)
							}
						>
							‹ Previous
						</Button>
						<span className="wots-subtle">
							{ index + 1 } of { items.length }
						</span>
						<Button
							size="small"
							variant="tertiary"
							onClick={ () =>
								setIndex( ( index + 1 ) % items.length )
							}
						>
							Next ›
						</Button>
					</>
				) }
				<span className="wots-subtle">
					Panel shown in your brand color. Each block sets its own
					look.
				</span>
			</div>
			<div
				className="wots-tpl-preview__frame"
				style={ {
					aspectRatio: `${ stage.width } / ${ stage.height }`,
				} }
			>
				{ item ? (
					<Stage fill="parent" size={ stage }>
						<PanelBackground
							panel={ panel }
							image={ bg.image }
							dim={ bg.dim }
						/>
						<PanelBox
							panel={
								bg.image ? { ...panel, opacity: 55 } : panel
							}
							wide
							contentKey="preview"
							design={ design }
						>
							<TemplateSlide
								template={ template }
								fields={ {
									block_name: 'Block Name',
									...item.fields,
								} }
								elementTypes={ types }
							/>
						</PanelBox>
					</Stage>
				) : (
					<div className="wots-tpl-preview__empty">
						{ loading
							? 'Loading a real item…'
							: 'No current items in this data source to preview.' }
					</div>
				) }
			</div>
		</div>
	);
}
