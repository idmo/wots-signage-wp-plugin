/**
 * Playlist shapes returned by GET /wots-signage/v1/player/playlist.
 * Mirrors includes/Resolver.php — keep the two in step.
 */

export interface ImageAsset {
	id: number;
	url: string;
	width: number;
	height: number;
	alt?: string;
}

export interface VideoAsset {
	id: number;
	url: string;
	mime: string;
	duration: number | null;
	poster: ImageAsset | null;
}

export type FitMode = 'cover' | 'contain' | 'contain-blur';

export type TransitionType = 'cut' | 'crossfade' | 'slide' | 'zoom';
export type ContentAnimation = 'none' | 'fade' | 'slide' | 'zoom';

interface BaseItem {
	key: string;
	/** The lineup show this item came from (absent in previews). */
	show?: number;
	/** Items expanded from one block (carousel) share a group. */
	group: string;
	block_id: number;
	block_name: string;
	duration: number; // seconds
	transition: { type: TransitionType; ms: number };
}

export interface ImageItem extends BaseItem {
	type: 'image';
	fit: FitMode;
	image: ImageAsset;
}

export interface VideoItem extends BaseItem {
	type: 'video';
	fit: FitMode;
	video: VideoAsset;
}

/** Panel styling for dynamic blocks (ported from the Next.js build). */
export interface PanelStyle {
	background: ImageAsset | null;
	color: string;
	opacity: number; // 0–100
	title: string;
	body: string;
	meta: string;
	animation: ContentAnimation;
	animation_ms: number;
}

export interface ElementPlacement {
	element: string;
	options: {
		size?: 's' | 'm' | 'l' | 'xl';
		fit?: 'cover' | 'contain';
		align?: 'left' | 'center' | 'right';
		/** The "Text" element's words. */
		text?: string;
		/** Which text style the "Text" element borrows. */
		role?: 'title' | 'meta' | 'body';
	};
}

/** Region sizes and background (includes/Templates.php normalize_design). */
export interface TemplateDesign {
	/** Percent of the width given to the first column. */
	col: number;
	/** Percent of the height given to the first row. */
	row: number;
	/** Image element shown full-screen behind the panel, or ''. */
	background: string;
	/** 0–90: how much to darken that background. */
	dim: number;
}

export const DEFAULT_DESIGN: TemplateDesign = {
	col: 50,
	row: 50,
	background: '',
	dim: 30,
};

export interface ResolvedTemplate {
	id: number;
	layout: 'full' | 'stack' | 'split_left' | 'split_right';
	regions: Record< string, ElementPlacement[] >;
	design?: TemplateDesign;
}

/** The canvas everything is laid out on (Settings::stage()). */
export interface StageSize {
	aspect: string;
	width: number;
	height: number;
}

/** One source item's values, keyed by element key (plus a few extras). */
export type Fields = Record< string, unknown > & { block_name?: string };

interface SlideBase extends BaseItem {
	type: 'slide';
	source: string; // 'events' | 'community_board' | 'featured_readers' | …
	panel: PanelStyle;
	template: ResolvedTemplate | null;
}

export interface CarouselSlide extends SlideBase {
	mode: 'carousel';
	fields: Fields;
}

export interface ListSlide extends SlideBase {
	mode: 'list';
	label: string;
	items: Array< Fields & { id: string } >;
}

export type SlideItem = CarouselSlide | ListSlide;

export type PlaylistItem = ImageItem | VideoItem | SlideItem;

export interface Playlist {
	version: string;
	generated_at: string;
	show: { id: number; title: string } | null;
	shows?: Array< { id: number; title: string } >;
	settings: {
		poll_interval: number;
		brand_color: string;
		stage?: StageSize;
	};
	items: PlaylistItem[];
}
