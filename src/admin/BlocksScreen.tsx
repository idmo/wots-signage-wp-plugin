import { Button, SearchControl, SelectControl } from '@wordpress/components';
import { useMemo, useState } from '@wordpress/element';
import type { BlockSummary, Category } from './api';
import {
	StatusBadge,
	TYPE_LABELS,
	Thumb,
	formatSeconds,
	scheduleText,
} from './common';

interface Props {
	blocks: BlockSummary[];
	categories: Category[];
	onEdit: ( id: number ) => void;
	onNew: () => void;
}

const STATUS_OPTIONS: Array< { value: string; label: string } > = [
	{ value: '', label: 'Any status' },
	{ value: 'active', label: 'Active' },
	{ value: 'scheduled', label: 'Scheduled' },
	{ value: 'expired', label: 'Expired' },
	{ value: 'archived', label: 'Archived' },
];

/** Block library with filters by category, status, and type (PRD §9.1). */
export function BlocksScreen( { blocks, categories, onEdit, onNew }: Props ) {
	const [ search, setSearch ] = useState( '' );
	const [ type, setType ] = useState( '' );
	const [ status, setStatus ] = useState( '' );
	const [ category, setCategory ] = useState( '' );

	const filtered = useMemo(
		() =>
			blocks.filter(
				( b ) =>
					( ! search ||
						b.title
							.toLowerCase()
							.includes( search.toLowerCase() ) ) &&
					( ! type || b.type === type ) &&
					( ! status || b.status === status ) &&
					( ! category ||
						b.categories.some(
							( c ) => String( c.id ) === category
						) )
			),
		[ blocks, search, type, status, category ]
	);

	return (
		<div className="wots-blocks">
			<div className="wots-filters">
				<SearchControl
					__nextHasNoMarginBottom
					value={ search }
					onChange={ setSearch }
					placeholder="Search blocks"
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Type"
					hideLabelFromVision
					value={ type }
					options={ [
						{ value: '', label: 'All types' },
						...Object.entries( TYPE_LABELS ).map(
							( [ value, label ] ) => ( { value, label } )
						),
					] }
					onChange={ setType }
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Status"
					hideLabelFromVision
					value={ status }
					options={ STATUS_OPTIONS }
					onChange={ setStatus }
				/>
				{ categories.length > 0 && (
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Category"
						hideLabelFromVision
						value={ category }
						options={ [
							{ value: '', label: 'All categories' },
							...categories.map( ( c ) => ( {
								value: String( c.id ),
								label: c.name,
							} ) ),
						] }
						onChange={ setCategory }
					/>
				) }
				<span className="wots-spacer" />
				<Button variant="primary" onClick={ onNew }>
					New block
				</Button>
			</div>

			{ filtered.length === 0 ? (
				<p className="wots-empty">
					{ blocks.length
						? 'No blocks match these filters.'
						: 'No blocks yet. Create your first one.' }
				</p>
			) : (
				<table className="widefat striped wots-table">
					<thead>
						<tr>
							<th
								className="wots-col-thumb"
								aria-label="Preview"
							/>
							<th>Name</th>
							<th>Type</th>
							<th>Schedule</th>
							<th>Duration</th>
							<th>Status</th>
							<th>In show</th>
						</tr>
					</thead>
					<tbody>
						{ filtered.map( ( b ) => (
							<tr key={ b.id }>
								<td className="wots-col-thumb">
									<Thumb block={ b } />
								</td>
								<td>
									<button
										type="button"
										className="wots-link"
										onClick={ () => onEdit( b.id ) }
									>
										{ b.title || '(untitled)' }
									</button>
									{ b.categories.length > 0 && (
										<div className="wots-subtle">
											{ b.categories
												.map( ( c ) => c.name )
												.join( ', ' ) }
										</div>
									) }
									{ b.issue && (
										<div className="wots-row-item__issue">
											{ b.issue }
										</div>
									) }
								</td>
								<td>
									{ TYPE_LABELS[
										b.type as keyof typeof TYPE_LABELS
									] ?? '—' }
									{ b.detail && (
										<div className="wots-subtle">
											{ b.detail }
										</div>
									) }
								</td>
								<td>{ scheduleText( b ) }</td>
								<td>
									{ b.type === 'dynamic_template'
										? `${ b.duration }s / item`
										: formatSeconds( b.duration ) }
								</td>
								<td>
									<StatusBadge status={ b.status } />
								</td>
								<td>{ b.in_live_show ? 'Yes' : '—' }</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }
		</div>
	);
}
