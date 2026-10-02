import { Button, SelectControl } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { REGION_LABELS, TEMPLATE_LAYOUTS } from '../shared/templates';
import type { DataSourceInfo, TemplateRecord, TemplateSummary } from './api';
import { TemplateBuilder } from './TemplateBuilder';

interface Props {
	templates: TemplateSummary[];
	dataSources: DataSourceInfo[];
	onChanged: ( message: string ) => void;
}

/** Templates tab: the list, and the builder for one template. */
export function TemplatesScreen( {
	templates,
	dataSources,
	onChanged,
}: Props ) {
	const [ editing, setEditing ] = useState<
		( TemplateRecord & { usedBy: number } ) | null
	>( null );
	const [ newSource, setNewSource ] = useState(
		dataSources[ 0 ]?.key ?? 'events'
	);

	if ( editing ) {
		return (
			<TemplateBuilder
				key={ editing.id ?? 'new' }
				initial={ editing }
				usedBy={ editing.usedBy }
				dataSources={ dataSources }
				onClose={ () => setEditing( null ) }
				onSaved={ ( id ) => {
					setEditing( ( e ) => ( e ? { ...e, id } : e ) );
					onChanged(
						'Template saved. Blocks using it update on the next check.'
					);
				} }
				onDeleted={ () => {
					setEditing( null );
					onChanged( 'Template deleted.' );
				} }
			/>
		);
	}

	return (
		<div className="wots-templates">
			<div className="wots-filters">
				<p className="wots-hint wots-hint--inline">
					A template arranges a data source’s elements on screen. Pick
					one in a dynamic block’s Layout setting.
				</p>
				<span className="wots-spacer" />
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Data source for a new template"
					hideLabelFromVision
					value={ newSource }
					options={ dataSources.map( ( s ) => ( {
						value: s.key,
						label: s.label,
					} ) ) }
					onChange={ setNewSource }
				/>
				<Button
					variant="primary"
					onClick={ () =>
						setEditing( {
							title: '',
							data_source: newSource,
							layout: 'stack',
							placements: {},
							usedBy: 0,
						} )
					}
				>
					New template
				</Button>
			</div>

			{ templates.length === 0 ? (
				<p className="wots-empty">
					No templates yet. Dynamic blocks use the built-in layout
					until you make one.
				</p>
			) : (
				<table className="widefat striped wots-table">
					<thead>
						<tr>
							<th
								className="wots-col-thumb"
								aria-label="Layout"
							/>
							<th>Name</th>
							<th>Data source</th>
							<th>Elements</th>
							<th>Used by</th>
						</tr>
					</thead>
					<tbody>
						{ templates.map( ( t ) => {
							const layout =
								TEMPLATE_LAYOUTS[ t.layout ] ??
								TEMPLATE_LAYOUTS.stack;
							const count = Object.values( t.placements ).flat()
								.length;
							return (
								<tr key={ t.id }>
									<td className="wots-col-thumb">
										<span
											className="wots-layout-thumb is-small"
											style={ {
												gridTemplateAreas: layout.areas,
											} }
										>
											{ layout.regions.map( ( r ) => (
												<span
													key={ r }
													style={ { gridArea: r } }
													title={ REGION_LABELS[ r ] }
												/>
											) ) }
										</span>
									</td>
									<td>
										<button
											type="button"
											className="wots-link"
											onClick={ () =>
												setEditing( {
													id: t.id,
													title: t.title,
													data_source: t.data_source,
													layout: t.layout,
													placements: t.placements,
													usedBy: t.used_by,
												} )
											}
										>
											{ t.title || '(untitled)' }
										</button>
										<div className="wots-subtle">
											{ layout.label }
										</div>
									</td>
									<td>{ t.source_label }</td>
									<td>{ count }</td>
									<td>
										{ t.used_by
											? `${ t.used_by } block${ t.used_by === 1 ? '' : 's' }`
											: '—' }
									</td>
								</tr>
							);
						} ) }
					</tbody>
				</table>
			) }
		</div>
	);
}
