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
	};
}

export interface ResolvedTemplate {
	id: number;
	layout: 'stack' | 'split_left' | 'split_right';
	regions: Record< string, ElementPlacement[] >;
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
	settings: { poll_interval: number; brand_color: string };
	items: PlaylistItem[];
}
