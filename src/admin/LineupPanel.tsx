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
import { Button, Notice } from '@wordpress/components';
import type { ShowSummary } from './api';

interface Props {
	shows: ShowSummary[];
	currentId: number;
	busy: boolean;
	/** Save a new lineup: show IDs in play order. */
	onChange: ( ids: number[] ) => void;
	onEdit: ( id: number ) => void;
}

/** Show IDs in the lineup, in play order. */
export function lineupIds( shows: ShowSummary[] ): number[] {
	return shows
		.filter( ( s ) => s.position > 0 )
		.sort( ( a, b ) => a.position - b.position )
		.map( ( s ) => s.id );
}

/**
 * What plays on the TV: every ticked show, one after another, then the
 * whole lineup repeats. Drag ticked shows to change their order.
 */
export function LineupPanel( {
	shows,
	currentId,
	busy,
	onChange,
	onEdit,
}: Props ) {
	const ids = lineupIds( shows );
	const byId = new Map( shows.map( ( s ) => [ s.id, s ] ) );
	const off = shows.filter( ( s ) => s.position === 0 );

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
		onChange(
			arrayMove(
				ids,
				ids.indexOf( Number( active.id ) ),
				ids.indexOf( Number( over.id ) )
			)
		);
	};

	const toggle = ( id: number, on: boolean ) =>
		onChange( on ? [ ...ids, id ] : ids.filter( ( x ) => x !== id ) );

	return (
		<section className="wots-lineup" aria-labelledby="wots-lineup-title">
			<div className="wots-lineup__head">
				<h2 id="wots-lineup-title">On the TV</h2>
				<p className="wots-hint wots-hint--inline">
					Ticked shows play one after another, then the lineup
					repeats. Drag to change the order. Changes reach the TV on
					its next check.
				</p>
			</div>

			{ ids.length === 0 && (
				<Notice status="warning" isDismissible={ false }>
					No shows are ticked, so the TV shows a blank screen.
				</Notice>
			) }

			<DndContext
				sensors={ sensors }
				collisionDetection={ closestCenter }
				onDragEnd={ onDragEnd }
			>
				<SortableContext
					items={ ids }
					strategy={ verticalListSortingStrategy }
				>
					<ol className="wots-lineup__list">
						{ ids.map( ( id, i ) => {
							const show = byId.get( id );
							return show ? (
								<LineupRow
									key={ id }
									show={ show }
									position={ i + 1 }
									current={ id === currentId }
									busy={ busy }
									onToggle={ ( on ) => toggle( id, on ) }
									onEdit={ () => onEdit( id ) }
								/>
							) : null;
						} ) }
					</ol>
				</SortableContext>
			</DndContext>

			{ off.length > 0 && (
				<ul className="wots-lineup__list is-off">
					{ off.map( ( show ) => (
						<li
							key={ show.id }
							className={ `wots-lineup__row${ show.id === currentId ? ' is-current' : '' }` }
						>
							<span className="wots-lineup__handle" />
							<input
								type="checkbox"
								className="wots-lineup__check"
								aria-label={ `Play “${ show.title }” on the TV` }
								checked={ false }
								disabled={ busy }
								onChange={ () => toggle( show.id, true ) }
							/>
							<span className="wots-lineup__pos" />
							<ShowName
								show={ show }
								onEdit={ () => onEdit( show.id ) }
							/>
							<span className="wots-subtle">Not playing</span>
						</li>
					) ) }
				</ul>
			) }
		</section>
	);
}

function ShowName( {
	show,
	onEdit,
}: {
	show: ShowSummary;
	onEdit: () => void;
} ) {
	return (
		<span className="wots-lineup__name">
			<Button variant="link" onClick={ onEdit }>
				{ show.title }
			</Button>
			<span className="wots-subtle">
				{ show.count } block{ show.count === 1 ? '' : 's' }
			</span>
		</span>
	);
}

function LineupRow( {
	show,
	position,
	current,
	busy,
	onToggle,
	onEdit,
}: {
	show: ShowSummary;
	position: number;
	current: boolean;
	busy: boolean;
	onToggle: ( on: boolean ) => void;
	onEdit: () => void;
} ) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable( { id: show.id } );
	return (
		<li
			ref={ setNodeRef }
			style={ {
				transform: CSS.Transform.toString( transform ),
				transition,
			} }
			className={ `wots-lineup__row is-on${ current ? ' is-current' : '' }${ isDragging ? ' is-dragging' : '' }` }
		>
			<button
				type="button"
				className="wots-handle wots-lineup__handle"
				aria-label={ `Reorder ${ show.title }` }
				{ ...attributes }
				{ ...listeners }
			>
				⋮⋮
			</button>
			<input
				type="checkbox"
				className="wots-lineup__check"
				aria-label={ `Play “${ show.title }” on the TV` }
				checked
				disabled={ busy }
				onChange={ () => onToggle( false ) }
			/>
			<span className="wots-lineup__pos">{ position }</span>
			<ShowName show={ show } onEdit={ onEdit } />
			<span className="wots-badge wots-badge--active">Playing</span>
		</li>
	);
}
