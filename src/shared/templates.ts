import type { CSSProperties } from 'react';
import type { GridRow, TemplateDesign } from './types';

/**
 * Template Builder layouts (PRD §7). Mirrors includes/Templates.php and the
 * Next.js build's lib/templates.ts: a 2×2 CSS grid with named areas.
 */
export const TEMPLATE_LAYOUTS = {
	full: {
		label: 'One region',
		areas: '"main main" "main main"',
		regions: [ 'main' ],
	},
	stack: {
		label: 'Top, then 2 columns',
		areas: '"top top" "bl br"',
		regions: [ 'top', 'bl', 'br' ],
	},
	split_left: {
		label: '2 rows left, full right',
		areas: '"lt right" "lb right"',
		regions: [ 'lt', 'lb', 'right' ],
	},
	split_right: {
		label: 'Full left, 2 rows right',
		areas: '"left rt" "left rb"',
		regions: [ 'left', 'rt', 'rb' ],
	},
	custom: {
		label: 'Custom grid',
		areas: '',
		regions: [],
	},
} as const;

export type LayoutId = keyof typeof TEMPLATE_LAYOUTS;

export const MAX_ROWS = 4;
export const MAX_COLS = 4;

/** Zone names for a layout: the preset's, or r1c1… for a custom grid. */
export function layoutRegions(
	layout: LayoutId,
	design?: Pick< TemplateDesign, 'rows' > | null
): string[] {
	if ( layout !== 'custom' ) {
		return [
			...( ( TEMPLATE_LAYOUTS[ layout ] ?? TEMPLATE_LAYOUTS.stack )
				.regions as readonly string[] ),
		];
	}
	const rows = design?.rows?.length
		? design.rows
		: [ { h: 100, cols: [ 100 ] } ];
	return rows.flatMap( ( row, r ) =>
		row.cols.map( ( _, c ) => `r${ r + 1 }c${ c + 1 }` )
	);
}

/** "Row 2 · Zone 3" for custom zones, else the preset's name. */
export function regionLabel( region: string ): string {
	const m = /^r(\d)c(\d)$/.exec( region );
	return m
		? `Row ${ m[ 1 ] } · Zone ${ m[ 2 ] }`
		: ( REGION_LABELS[ region ] ?? region );
}

/** Even sizes that add up to 100, e.g. 3 → [ 34, 33, 33 ]. */
export function evenSplit( count: number ): number[] {
	const base = Math.floor( 100 / count );
	return Array.from( { length: count }, ( _, i ) =>
		i < 100 - base * count ? base + 1 : base
	);
}

/**
 * A preset as a custom grid, and where each preset zone lands, so switching
 * to "Custom grid" keeps what was placed.
 */
export function presetAsGrid(
	layout: LayoutId,
	design: Pick< TemplateDesign, 'col' | 'row' >
): { rows: GridRow[]; map: Record< string, string > } {
	const { col, row } = design;
	switch ( layout ) {
		case 'full':
			return {
				rows: [ { h: 100, cols: [ 100 ] } ],
				map: { main: 'r1c1' },
			};
		case 'split_left':
			return {
				rows: [
					{ h: row, cols: [ col, 100 - col ] },
					{ h: 100 - row, cols: [ col, 100 - col ] },
				],
				map: { lt: 'r1c1', right: 'r1c2', lb: 'r2c1' },
			};
		case 'split_right':
			return {
				rows: [
					{ h: row, cols: [ col, 100 - col ] },
					{ h: 100 - row, cols: [ col, 100 - col ] },
				],
				map: { left: 'r1c1', rt: 'r1c2', rb: 'r2c2' },
			};
		case 'stack':
			return {
				rows: [
					{ h: row, cols: [ 100 ] },
					{ h: 100 - row, cols: [ col, 100 - col ] },
				],
				map: { top: 'r1c1', bl: 'r2c1', br: 'r2c2' },
			};
	}
	return { rows: [ { h: 100, cols: [ 100 ] } ], map: {} };
}

/** Which of the two splits a layout uses, for the resize handles. */
export function layoutSplits( layout: LayoutId ): {
	col: boolean;
	row: boolean;
} {
	const preset = layout !== 'full' && layout !== 'custom';
	return { col: preset, row: preset };
}

/** Grid styles for a layout with the template's region sizes. */
export function gridStyle(
	layout: LayoutId,
	design?: Partial< Pick< TemplateDesign, 'col' | 'row' | 'gap' > > | null
): CSSProperties {
	const l =
		layout === 'custom'
			? TEMPLATE_LAYOUTS.full
			: ( TEMPLATE_LAYOUTS[ layout ] ?? TEMPLATE_LAYOUTS.stack );
	const col = clampSplit( design?.col );
	const row = clampSplit( design?.row );
	return {
		gridTemplateAreas: l.areas,
		gridTemplateColumns: `minmax(0, ${ col }fr) minmax(0, ${ 100 - col }fr)`,
		gridTemplateRows: `minmax(0, ${ row }fr) minmax(0, ${ 100 - row }fr)`,
		...( typeof design?.gap === 'number' ? { gap: design.gap } : {} ),
	};
}

export function clampSplit( v: number | undefined ): number {
	return typeof v === 'number' && ! Number.isNaN( v )
		? Math.min( 85, Math.max( 15, Math.round( v ) ) )
		: 50;
}

export const REGION_LABELS: Record< string, string > = {
	main: 'Whole panel',
	top: 'Top',
	bl: 'Bottom left',
	br: 'Bottom right',
	lt: 'Left top',
	lb: 'Left bottom',
	right: 'Right',
	left: 'Left',
	rt: 'Right top',
	rb: 'Right bottom',
};

/** Text elements styled as the item's headline. */
export const TITLE_KEYS = [ 'title', 'book_title' ];
/** Text elements styled as secondary "meta" lines. */
export const META_KEYS = [
	'date_time',
	'organization',
	'block_name',
	'book_author',
	'reader_name',
];
