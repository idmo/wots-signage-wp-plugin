import apiFetch from '@wordpress/api-fetch';
import type { LayoutId } from '../shared/templates';
import type { ElementPlacement, Fields } from '../shared/types';

export interface AdminConfig {
	restRoot: string;
	nonce: string;
	playerUrl: string;
	previewUrl: string;
	exportUrl: string;
	maxUpload: number;
	settingsUrl: string;
	today: string;
	settings: {
		poll_interval: number;
		default_image_duration: number;
		default_item_duration: number;
		default_video_duration: number;
		brand_color: string;
		block_transition: string;
		transition_ms: number;
		content_animation: string;
		content_animation_ms: number;
	};
}

declare global {
	interface Window {
		wotsSignageAdmin: AdminConfig;
		wp: any; // wp.media global.
	}
}

export const adminConfig = (): AdminConfig => window.wotsSignageAdmin;

let ready = false;
function setup() {
	if ( ready ) {
		return;
	}
	ready = true;
	const { restRoot, nonce } = adminConfig();
	apiFetch.use( apiFetch.createRootURLMiddleware( restRoot ) );
	apiFetch.use( apiFetch.createNonceMiddleware( nonce ) );
}

export function api< T >( options: {
	path: string;
	method?: string;
	data?: unknown;
} ): Promise< T > {
	setup();
	return apiFetch< T >( options );
}

export const NS = '/wots-signage/v1';

// --- Shapes -----------------------------------------------------------------

export type BlockType = 'static_image' | 'video' | 'dynamic_template';
export type BlockStatus = 'active' | 'scheduled' | 'expired' | 'archived';

export interface BlockSummary {
	id: number;
	title: string;
	post_status: string;
	type: BlockType | '';
	status: BlockStatus;
	start_date: string;
	end_date: string;
	duration: number;
	thumbnail: string | null;
	detail: string;
	issue: string;
	categories: Array< { id: number; name: string } >;
	in_live_show: boolean;
	modified: string;
}

export interface ShowItem {
	block_id: number;
	pinned: boolean;
}

export interface LiveShow {
	id: number;
	title: string;
	items: ShowItem[];
	is_live: boolean;
}

export interface ShowSummary {
	id: number;
	title: string;
	count: number;
	is_live: boolean;
	modified: string;
}

export interface TemplateSummary {
	id: number;
	title: string;
	data_source: string;
	source_label: string;
	layout: LayoutId;
	placements: Record< string, ElementPlacement[] >;
	used_by: number;
	modified: string;
}

export interface DataSourceInfo {
	key: string;
	label: string;
	available: boolean;
	elements: Array< {
		key: string;
		label: string;
		type: string;
		hint?: string;
	} >;
}

export interface Heartbeat {
	time: number;
	version: string;
	item_key: string;
	item_name: string;
	last_error: string;
	offline: boolean;
	screen: string;
	user_agent: string;
}

export interface AdminStatus {
	version: string;
	player_url: string;
	heartbeat: Heartbeat | null;
	now: number;
}

export interface Category {
	id: number;
	name: string;
	meta?: { _default_duration?: number; _default_template_id?: number };
}

/** Block as stored through core /wp/v2/signage_block. */
export interface BlockRecord {
	id?: number;
	title: string;
	status: string;
	signage_category: number[];
	meta: {
		_block_type: BlockType;
		_start_date: string;
		_end_date: string;
		_duration_seconds: number;
		_fit_mode: 'cover' | 'contain' | 'contain-blur';
		_archived: boolean;
		_image_id: number;
		_text_heavy: boolean;
		_video_id: number;
		_data_source: string;
		_template_id: number;
		_display_mode: 'carousel' | 'list';
		_per_item_duration: number;
		_max_items: number;
		_list_label: string;
		_featured_month_year: string;
		_bg_image_id: number;
		_panel_color: string;
		_panel_opacity: number;
		_title_color: string;
		_body_color: string;
		_meta_color: string;
		_transition: string;
		_content_animation: string;
	};
}

// --- Calls ------------------------------------------------------------------

export const getBlocks = () =>
	api< BlockSummary[] >( { path: `${ NS }/blocks/summary` } );
export const getShow = () => api< LiveShow >( { path: `${ NS }/show` } );
export const saveShowItems = ( id: number, items: ShowItem[] ) =>
	api< { id: number; items: ShowItem[] } >( {
		path: `${ NS }/sequences/${ id }/items`,
		method: 'PUT',
		data: { items },
	} );
export const getDataSources = () =>
	api< DataSourceInfo[] >( { path: `${ NS }/data-sources` } );
export const getStatus = () =>
	api< AdminStatus >( { path: `${ NS }/admin/status` } );
export const refreshNow = () =>
	api< { version: string } >( {
		path: `${ NS }/player/refresh-now`,
		method: 'POST',
	} );
export const getCategories = () =>
	api< Category[] >( {
		path: '/wp/v2/signage_category?per_page=100&context=edit&_fields=id,name,meta',
	} );

export const getBlock = ( id: number ) =>
	api< BlockRecord & { title: { raw: string } } >( {
		path: `/wp/v2/signage_block/${ id }?context=edit&_fields=id,title,status,signage_category,meta`,
	} );

export const saveBlock = ( record: BlockRecord ) =>
	api< { id: number } >( {
		path: record.id
			? `/wp/v2/signage_block/${ record.id }`
			: '/wp/v2/signage_block',
		method: 'POST',
		data: record,
	} );

export const trashBlock = ( id: number ) =>
	api( { path: `/wp/v2/signage_block/${ id }`, method: 'DELETE' } );

// Shows
export const getShows = () =>
	api< ShowSummary[] >( { path: `${ NS }/sequences` } );
export const getShowById = ( id: number ) =>
	api< LiveShow >( { path: `${ NS }/sequences/${ id }` } );
export const createShow = ( title: string ) =>
	api< { id: number } >( {
		path: '/wp/v2/signage_sequence',
		method: 'POST',
		data: { title, status: 'publish', meta: { _items: '[]' } },
	} );
export const renameShow = ( id: number, title: string ) =>
	api( {
		path: `/wp/v2/signage_sequence/${ id }`,
		method: 'POST',
		data: { title },
	} );
export const duplicateShow = ( id: number ) =>
	api< { id: number } >( {
		path: `${ NS }/sequences/${ id }/duplicate`,
		method: 'POST',
	} );
export const deleteShow = ( id: number ) =>
	api( {
		path: `/wp/v2/signage_sequence/${ id }?force=true`,
		method: 'DELETE',
	} );
export const goLive = ( id: number ) =>
	api( { path: `${ NS }/sequences/${ id }/activate`, method: 'POST' } );

// Templates
export const getTemplates = () =>
	api< TemplateSummary[] >( { path: `${ NS }/templates` } );
export interface TemplateRecord {
	id?: number;
	title: string;
	data_source: string;
	layout: LayoutId;
	placements: Record< string, ElementPlacement[] >;
}
export const saveTemplate = ( t: TemplateRecord ) =>
	api< { id: number } >( {
		path: t.id
			? `/wp/v2/signage_template/${ t.id }`
			: '/wp/v2/signage_template',
		method: 'POST',
		data: {
			title: t.title,
			status: 'publish',
			meta: {
				_data_source: t.data_source,
				_layout: t.layout,
				_placements: JSON.stringify( t.placements ),
			},
		},
	} );
export const deleteTemplate = ( id: number ) =>
	api( {
		path: `/wp/v2/signage_template/${ id }?force=true`,
		method: 'DELETE',
	} );

// Import / export
export interface ImportConflict {
	kind: 'template' | 'block' | 'show';
	ref: string;
	title: string;
	existing_id: number;
}
export interface ImportAnalysis {
	token: string;
	kind: 'show' | 'full';
	site: string;
	exported: string;
	counts: {
		shows: number;
		blocks: number;
		templates: number;
		categories: number;
		media: number;
		media_reused: number;
	};
	settings: boolean;
	conflicts: ImportConflict[];
}
export type ImportDecision = 'skip' | 'overwrite' | 'copy';

export async function analyzeImport( file: File ): Promise< ImportAnalysis > {
	setup();
	const body = new FormData();
	body.append( 'file', file );
	return apiFetch< ImportAnalysis >( {
		path: `${ NS }/import/analyze`,
		method: 'POST',
		body,
	} );
}
export const commitImport = (
	token: string,
	decisions: Record< string, ImportDecision >,
	settings: boolean
) =>
	api< { created: number; updated: number; skipped: number; media: number } >(
		{
			path: `${ NS }/import/commit`,
			method: 'POST',
			data: { token, decisions, settings },
		}
	);

/** Real items from a data source, for previews. */
export const previewSource = ( key: string, monthYear = '' ) =>
	api< {
		available: boolean;
		items: Array< { id: string; fields: Fields } >;
	} >( {
		path: `${ NS }/data-sources/${ key }/preview?max_items=10&featured_month_year=${ encodeURIComponent( monthYear ) }`,
	} );

export interface MediaInfo {
	id: number;
	url: string;
	thumb: string;
	mime: string;
	title: string;
	length?: number | null;
}

export async function getMedia( id: number ): Promise< MediaInfo | null > {
	if ( ! id ) {
		return null;
	}
	try {
		const m = await api< any >( {
			path: `/wp/v2/media/${ id }?context=edit`,
		} );
		return {
			id: m.id,
			url: m.source_url,
			thumb:
				m.media_details?.sizes?.medium?.source_url ||
				( m.mime_type?.startsWith( 'image/' ) ? m.source_url : '' ),
			mime: m.mime_type,
			title: m.title?.raw || '',
			length: m.media_details?.length ?? null,
		};
	} catch {
		return null;
	}
}
