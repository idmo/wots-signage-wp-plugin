import {
	TEMPLATE_LAYOUTS,
	gridStyle,
	type LayoutId,
} from '../shared/templates';
import type { GridRow, TemplateDesign } from '../shared/types';

/**
 * A small picture of a layout: a preset's grid, or a custom grid's rows.
 */
export function LayoutThumb( {
	layout,
	design,
	small,
}: {
	layout: LayoutId;
	design?: Partial< TemplateDesign > | null;
	small?: boolean;
} ) {
	const cls = `wots-layout-thumb${ small ? ' is-small' : '' }`;
	if ( layout === 'custom' ) {
		const rows: GridRow[] = design?.rows?.length
			? design.rows
			: [ { h: 100, cols: [ 100 ] } ];
		return (
			<span className={ `${ cls } is-custom` }>
				{ rows.map( ( row, r ) => (
					<span
						key={ r }
						className="wots-layout-thumb__row"
						style={ { flex: `${ row.h } 1 0` } }
					>
						{ row.cols.map( ( w, c ) => (
							<span key={ c } style={ { flex: `${ w } 1 0` } } />
						) ) }
					</span>
				) ) }
			</span>
		);
	}
	const preset = TEMPLATE_LAYOUTS[ layout ] ?? TEMPLATE_LAYOUTS.stack;
	return (
		<span
			className={ cls }
			style={ gridStyle( layout, {
				col: design?.col,
				row: design?.row,
			} ) }
		>
			{ preset.regions.map( ( r ) => (
				<span key={ r } style={ { gridArea: r } } />
			) ) }
		</span>
	);
}
