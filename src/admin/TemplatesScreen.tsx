import { Button, SelectControl } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { TEMPLATE_LAYOUTS } from '../shared/templates';
import { DEFAULT_DESIGN } from '../shared/types';
import { LayoutThumb } from './LayoutThumb';
import type { DataSourceInfo, TemplateRecord, TemplateSummary } from './api';
import { TemplateBuilder } from './TemplateBuilder';

interface Props {
	templates: TemplateSummary[];
	dataSources: DataSourceInfo[];
	onChanged: ( message: string ) => void;
}

/** Headline-ish elements, in order of preference, for the starter. */
const TITLE_PREFERENCE = [ 'title', 'book_title', 'block_name' ];
const DETAIL_PREFERENCE = [ 'date_time', 'organization', 'book_author' ];
const BODY_PREFERENCE = [ 'excerpt', 'content_html', 'blurb_html' ];

/**
 * A ready-made template that fills the screen with each item's own image
 * (an event's featured image, a book's cover…) behind the panel.
 */
export function backgroundStarter( source: DataSourceInfo ): TemplateRecord {
	const keys = source.elements.map( ( e ) => e.key );
	const pick = ( list: string[] ) => list.find( ( k ) => keys.includes( k ) );
	const image = source.elements.find( ( e ) => e.type === 'image' );
	const title = pick( TITLE_PREFERENCE );
	const detail = pick( DETAIL_PREFERENCE );
	const body = pick( BODY_PREFERENCE );
	const top = [
		title && { element: title, options: { size: 'xl' as const } },
		detail && { element: detail, options: { size: 'l' as const } },
	].filter( Boolean ) as TemplateRecord[ 'placements' ][ string ];
	return {
		title: `${ source.label }: image background`,
		data_source: source.key,
		layout: 'stack',
		placements: {
			top,
			bl: body ? [ { element: body, options: {} } ] : [],
			br: [
				...( keys.includes( 'qr_code' )
					? [
							{
								element: 'qr_code',
								options: { align: 'right' as const },
							},
						]
					: [] ),
				{
					element: 'free_text',
					options: {
						text: 'Scan for details',
						role: 'meta' as const,
						align: 'right' as const,
					},
				},
			],
		},
		design: {
			...DEFAULT_DESIGN,
			row: 40,
			col: 62,
			background: image?.key ?? '',
			dim: 35,
		},
	};
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
					variant="secondary"
					disabled={
						! dataSources
							.find( ( s ) => s.key === newSource )
							?.elements.some( ( e ) => e.type === 'image' )
					}
					onClick={ () => {
						const source = dataSources.find(
							( s ) => s.key === newSource
						);
						if ( source ) {
							setEditing( {
								...backgroundStarter( source ),
								usedBy: 0,
							} );
						}
					} }
				>
					Starter: image background
				</Button>
				<Button
					variant="primary"
					onClick={ () =>
						setEditing( {
							title: '',
							data_source: newSource,
							layout: 'stack',
							placements: {},
							design: DEFAULT_DESIGN,
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
										<LayoutThumb
											small
											layout={ t.layout }
											design={ t.design }
										/>
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
													design: t.design,
													usedBy: t.used_by,
												} )
											}
										>
											{ t.title || '(untitled)' }
										</button>
										<div className="wots-subtle">
											{ t.layout === 'custom'
												? `Custom grid · ${
														t.design?.rows
															?.length ?? 1
													} row${
														( t.design?.rows
															?.length ?? 1 ) ===
														1
															? ''
															: 's'
													}`
												: layout.label }
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
