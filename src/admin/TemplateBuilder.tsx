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
	Notice,
	SelectControl,
	TextControl,
} from '@wordpress/components';
import { useEffect, useMemo, useState } from '@wordpress/element';
import { PanelBox } from '../shared/Panel';
import { Stage } from '../shared/Stage';
import { TemplateSlide } from '../shared/TemplateSlide';
import {
	REGION_LABELS,
	TEMPLATE_LAYOUTS,
	type LayoutId,
} from '../shared/templates';
import type { ElementPlacement, Fields, PanelStyle } from '../shared/types';
import {
	adminConfig,
	deleteTemplate,
	previewSource,
	saveTemplate,
	type DataSourceInfo,
	type TemplateRecord,
} from './api';

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
function fitToLayout( placements: Placements, layout: LayoutId ): Placements {
	const regions = TEMPLATE_LAYOUTS[ layout ].regions as readonly string[];
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
	const [ placements, setPlacements ] = useState< Placements >(
		fitToLayout( initial.placements, initial.layout )
	);
	const [ selectedRegion, setSelectedRegion ] = useState< string >(
		TEMPLATE_LAYOUTS[ initial.layout ].regions[ 0 ]
	);
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
	const regions = TEMPLATE_LAYOUTS[ layout ].regions as readonly string[];

	const update = ( next: Placements ) => {
		setPlacements( next );
		setDirty( true );
	};

	const changeLayout = ( next: LayoutId ) => {
		setLayout( next );
		update( fitToLayout( placements, next ) );
		setSelectedRegion( TEMPLATE_LAYOUTS[ next ].regions[ 0 ] );
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
	};

	const addTo = ( region: string, key: string, index?: number ) => {
		const list = [ ...( placements[ region ] ?? [] ) ];
		list.splice( index ?? list.length, 0, { element: key, options: {} } );
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
						{ ( Object.keys( TEMPLATE_LAYOUTS ) as LayoutId[] ).map(
							( id ) => (
								<button
									key={ id }
									type="button"
									role="radio"
									aria-checked={ layout === id }
									className={ `wots-layout-pick${ layout === id ? ' is-selected' : '' }` }
									onClick={ () => changeLayout( id ) }
								>
									<span
										className="wots-layout-thumb"
										style={ {
											gridTemplateAreas:
												TEMPLATE_LAYOUTS[ id ].areas,
										} }
									>
										{ TEMPLATE_LAYOUTS[ id ].regions.map(
											( r ) => (
												<span
													key={ r }
													style={ { gridArea: r } }
												/>
											)
										) }
									</span>
									<span>
										{ TEMPLATE_LAYOUTS[ id ].label }
									</span>
								</button>
							)
						) }
					</div>
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

						<div
							className="wots-regions"
							style={ {
								gridTemplateAreas:
									TEMPLATE_LAYOUTS[ layout ].areas,
							} }
						>
							{ regions.map( ( r ) => (
								<RegionBox
									key={ r }
									region={ r }
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
							) ) }
						</div>
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
				types={ types }
			/>
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
	selected,
	onSelect,
	items,
	labels,
	types,
	onRemove,
	onOptions,
}: {
	region: string;
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
			style={ { gridArea: region } }
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
				{ REGION_LABELS[ region ] ?? region }
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
			<span className="wots-placed__label">{ label }</span>
			<span className="wots-placed__opts">
				{ ( type === 'text' || type === 'html' ) && (
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
				{ type === 'image' && (
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
				{ type !== 'image' && (
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
		</div>
	);
}

/** Live preview with a real item from the data source. */
function TemplatePreview( {
	source,
	layout,
	placements,
	types,
}: {
	source: string;
	layout: LayoutId;
	placements: Placements;
	types: Record< string, string >;
} ) {
	const [ items, setItems ] = useState<
		Array< { id: string; fields: Fields } >
	>( [] );
	const [ index, setIndex ] = useState( 0 );
	const [ loading, setLoading ] = useState( true );
	const { settings } = adminConfig();

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
			<div className="wots-tpl-preview__frame">
				{ item ? (
					<Stage fill="parent">
						<div className="wots-panel-bg" />
						<PanelBox panel={ panel } wide contentKey="preview">
							<TemplateSlide
								template={ { layout, regions: placements } }
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
