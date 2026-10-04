import type { CSSProperties } from 'react';
import type { TemplateDesign } from './types';

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
} as const;

export type LayoutId = keyof typeof TEMPLATE_LAYOUTS;

/** Which of the two splits a layout uses, for the resize handles. */
export function layoutSplits( layout: LayoutId ): {
	col: boolean;
	row: boolean;
} {
	return { col: layout !== 'full', row: layout !== 'full' };
}

/** Grid styles for a layout with the template's region sizes. */
export function gridStyle(
	layout: LayoutId,
	design?: Pick< TemplateDesign, 'col' | 'row' > | null
): CSSProperties {
	const l = TEMPLATE_LAYOUTS[ layout ] ?? TEMPLATE_LAYOUTS.stack;
	const col = clampSplit( design?.col );
	const row = clampSplit( design?.row );
	return {
		gridTemplateAreas: l.areas,
		gridTemplateColumns: `minmax(0, ${ col }fr) minmax(0, ${ 100 - col }fr)`,
		gridTemplateRows: `minmax(0, ${ row }fr) minmax(0, ${ 100 - row }fr)`,
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
