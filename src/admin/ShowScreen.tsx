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
import { Button, ComboboxControl, Notice } from '@wordpress/components';
import { useMemo, useState } from '@wordpress/element';
import type { BlockSummary, LiveShow, ShowItem } from './api';
import {
	StatusBadge,
	TYPE_LABELS,
	Thumb,
	formatSeconds,
	scheduleText,
} from './common';

interface Props {
	show: LiveShow;
	blocks: BlockSummary[];
	saving: boolean;
	onChange: ( items: ShowItem[] ) => void;
	onEditBlock: ( id: number ) => void;
	onNewBlock: () => void;
}

/** Rows need stable IDs for dnd-kit even when a block appears twice. */
interface Row extends ShowItem {
	rowId: string;
}

export function ShowScreen( {
	show,
	blocks,
	saving,
	onChange,
	onEditBlock,
	onNewBlock,
}: Props ) {
	const byId = useMemo(
		() => new Map( blocks.map( ( b ) => [ b.id, b ] ) ),
		[ blocks ]
	);
	const rows: Row[] = useMemo( () => {
		const seen: Record< number, number > = {};
		return show.items.map( ( item ) => {
			seen[ item.block_id ] = ( seen[ item.block_id ] ?? 0 ) + 1;
			return {
				...item,
				rowId: `${ item.block_id }-${ seen[ item.block_id ] }`,
			};
		} );
	}, [ show.items ] );

	const [ adding, setAdding ] = useState< string | null >( null );

	const sensors = useSensors(
		useSensor( PointerSensor, { activationConstraint: { distance: 4 } } ),
		useSensor( KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		} )
	);

	const commit = ( next: Row[] ) =>
		onChange(
			next.map( ( { block_id, pinned } ) => ( { block_id, pinned } ) )
		);

	const onDragEnd = ( event: DragEndEvent ) => {
		const { active, over } = event;
		if ( ! over || active.id === over.id ) {
			return;
		}
		const from = rows.findIndex( ( r ) => r.rowId === active.id );
		const to = rows.findIndex( ( r ) => r.rowId === over.id );
		commit( arrayMove( rows, from, to ) );
	};

	const playing = rows.filter(
		( r ) =>
			byId.get( r.block_id )?.status === 'active' &&
			! byId.get( r.block_id )?.issue
	);
	const loopSeconds = playing.reduce(
		( sum, r ) => sum + ( byId.get( r.block_id )?.duration ?? 0 ),
		0
	);
	const hasDynamic = playing.some(
		( r ) => byId.get( r.block_id )?.type === 'dynamic_template'
	);

	const addable = blocks
		.filter( ( b ) => b.status !== 'archived' )
		.map( ( b ) => ( {
			value: String( b.id ),
			label: `${ b.title } (${ TYPE_LABELS[ b.type as keyof typeof TYPE_LABELS ] ?? '?' })`,
		} ) );

	return (
		<div className="wots-show">
			<div className="wots-show__summary">
				<span>
					<strong>{ playing.length }</strong> of { rows.length }{ ' ' }
					blocks playing
				</span>
				<span>
					Loop ≈ <strong>{ formatSeconds( loopSeconds ) }</strong>
					{ hasDynamic && ' (dynamic blocks count once per item)' }
				</span>
				<span className="wots-save-state">
					{ saving ? 'Saving…' : 'All changes saved' }
				</span>
			</div>

			{ rows.length === 0 && (
				<Notice status="info" isDismissible={ false }>
					This show is empty. Add a block below, or create a new one.
				</Notice>
			) }

			<DndContext
				sensors={ sensors }
				collisionDetection={ closestCenter }
				onDragEnd={ onDragEnd }
			>
				<SortableContext
					items={ rows.map( ( r ) => r.rowId ) }
					strategy={ verticalListSortingStrategy }
				>
					<ol className="wots-show__list">
						{ rows.map( ( row, i ) => (
							<SortableRow
								key={ row.rowId }
								row={ row }
								position={ i + 1 }
								block={ byId.get( row.block_id ) }
								onEdit={ () => onEditBlock( row.block_id ) }
								onRemove={ () =>
									commit(
										rows.filter(
											( r ) => r.rowId !== row.rowId
										)
									)
								}
							/>
						) ) }
					</ol>
				</SortableContext>
			</DndContext>

			<div className="wots-show__add">
				<ComboboxControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Add an existing block"
					value={ adding }
					options={ addable }
					onChange={ ( v ) => {
						if ( v ) {
							commit( [
								...rows,
								{
									block_id: Number( v ),
									pinned: false,
									rowId: 'new',
								},
							] );
						}
						setAdding( null );
					} }
				/>
				<Button variant="secondary" onClick={ onNewBlock }>
					New block…
				</Button>
			</div>
		</div>
	);
}

function SortableRow( {
	row,
	position,
	block,
	onEdit,
	onRemove,
}: {
	row: Row;
	position: number;
	block: BlockSummary | undefined;
	onEdit: () => void;
	onRemove: () => void;
} ) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable( { id: row.rowId } );
	const style = {
		transform: CSS.Transform.toString( transform ),
		transition,
	};

	if ( ! block ) {
		return (
			<li
				ref={ setNodeRef }
				style={ style }
				className="wots-row-item is-missing"
			>
				<span className="wots-row-item__pos">{ position }</span>
				<span>Block #{ row.block_id } was deleted.</span>
				<Button variant="link" isDestructive onClick={ onRemove }>
					Remove
				</Button>
			</li>
		);
	}

	const notPlaying = block.status !== 'active' || !! block.issue;

	return (
		<li
			ref={ setNodeRef }
			style={ style }
			className={ `wots-row-item${ notPlaying ? ' is-inactive' : '' }${ isDragging ? ' is-dragging' : '' }` }
		>
			<button
				type="button"
				className="wots-handle"
				aria-label={ `Reorder ${ block.title }` }
				{ ...attributes }
				{ ...listeners }
			>
				⋮⋮
			</button>
			<span className="wots-row-item__pos">{ position }</span>
			<Thumb block={ block } />
			<div className="wots-row-item__main">
				<button
					type="button"
					className="wots-row-item__title"
					onClick={ onEdit }
				>
					{ block.title || '(untitled)' }
				</button>
				<div className="wots-row-item__meta">
					{ TYPE_LABELS[ block.type as keyof typeof TYPE_LABELS ] ??
						'Unknown' }
					{ block.detail && ` · ${ block.detail }` } ·{ ' ' }
					{ scheduleText( block ) } ·{ ' ' }
					{ block.type === 'dynamic_template'
						? `${ block.duration }s each`
						: formatSeconds( block.duration ) }
				</div>
				{ block.issue && (
					<div className="wots-row-item__issue">{ block.issue }</div>
				) }
			</div>
			<StatusBadge status={ block.status } />
			<Button
				variant="tertiary"
				size="small"
				onClick={ onRemove }
				label="Remove from show"
				showTooltip
			>
				Remove
			</Button>
		</li>
	);
}
