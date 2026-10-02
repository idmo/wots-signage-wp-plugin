/**
 * Template Builder layouts (PRD §7). Mirrors includes/Templates.php and the
 * Next.js build's lib/templates.ts: a 2×2 CSS grid with named areas.
 */
export const TEMPLATE_LAYOUTS = {
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

export const REGION_LABELS: Record< string, string > = {
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
