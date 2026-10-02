import {
	BaseControl,
	Notice,
	RangeControl,
	SelectControl,
	TextControl,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import {
	adminConfig,
	previewSource,
	type BlockRecord,
	type DataSourceInfo,
	type TemplateSummary,
} from './api';
import { MediaPicker } from './MediaPicker';

type Meta = BlockRecord[ 'meta' ];
type SetMeta = ( patch: Partial< Meta > ) => void;

/** Matches each data source's DEFAULT_MAX in PHP. */
const MAX_DEFAULTS: Record< string, string > = {
	events: '5',
	community_board: '10',
	featured_readers: '20',
};

const int = ( v: string ) => Math.max( 0, parseInt( v, 10 ) || 0 );

/**
 * Data source, display mode, timing, template, and (Featured Readers)
 * month for a dynamic block (PRD §9.2).
 */
export function DynamicSettings( {
	meta,
	setMeta,
	dataSources,
	templates,
	itemDefault,
}: {
	meta: Meta;
	setMeta: SetMeta;
	dataSources: DataSourceInfo[];
	templates: TemplateSummary[];
	itemDefault: number;
} ) {
	const source = dataSources.find( ( s ) => s.key === meta._data_source );
	const isList = meta._display_mode === 'list';
	const usable = templates.filter(
		( t ) => t.data_source === meta._data_source
	);

	return (
		<div className="wots-fieldset">
			<div className="wots-row">
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Data source"
					value={ meta._data_source }
					options={ dataSources.map( ( s ) => ( {
						value: s.key,
						label: s.available
							? s.label
							: `${ s.label } (not available)`,
					} ) ) }
					onChange={ ( v ) =>
						setMeta( { _data_source: v, _template_id: 0 } )
					}
				/>
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Display"
					value={ meta._display_mode || 'carousel' }
					options={ [
						{
							value: 'carousel',
							label: 'Carousel: one item per slide',
						},
						{
							value: 'list',
							label: 'List: all items on one slide',
						},
					] }
					onChange={ ( v ) =>
						setMeta( {
							_display_mode: v as Meta[ '_display_mode' ],
						} )
					}
				/>
			</div>
			{ source && ! source.available && (
				<Notice status="warning" isDismissible={ false }>
					{ source.label } isn’t available on this site (its plugin or
					post type is missing), so this block will be skipped.
				</Notice>
			) }

			<div className="wots-row">
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					type="number"
					min={ 1 }
					max={ 100 }
					label="Show up to"
					help="items"
					placeholder={ MAX_DEFAULTS[ meta._data_source ] ?? '10' }
					value={ String( meta._max_items || '' ) }
					onChange={ ( v ) => setMeta( { _max_items: int( v ) } ) }
				/>
				{ isList ? (
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						label="Seconds on screen"
						placeholder={ String( itemDefault ) }
						help={ `The whole list. Blank = ${ itemDefault }s` }
						value={
							meta._duration_seconds
								? String( meta._duration_seconds )
								: ''
						}
						onChange={ ( v ) =>
							setMeta( { _duration_seconds: int( v ) } )
						}
					/>
				) : (
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						label="Seconds per item"
						placeholder={ String( itemDefault ) }
						help={ `Blank = ${ itemDefault }s` }
						value={
							meta._per_item_duration
								? String( meta._per_item_duration )
								: ''
						}
						onChange={ ( v ) =>
							setMeta( { _per_item_duration: int( v ) } )
						}
					/>
				) }
			</div>

			{ isList ? (
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="List heading"
					help="Optional, e.g. “Coming Up at the Shop”."
					value={ meta._list_label }
					onChange={ ( v ) => setMeta( { _list_label: v } ) }
				/>
			) : (
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Layout"
					value={ String( meta._template_id || 0 ) }
					options={ [
						{ value: '0', label: 'Built-in layout' },
						...usable.map( ( t ) => ( {
							value: String( t.id ),
							label: t.title,
						} ) ),
					] }
					help={
						usable.length
							? 'Templates are built on the Templates tab.'
							: `No templates for ${ source?.label ?? 'this source' } yet. Build one on the Templates tab.`
					}
					onChange={ ( v ) => setMeta( { _template_id: int( v ) } ) }
				/>
			) }

			{ meta._data_source === 'featured_readers' && (
				<MonthField meta={ meta } setMeta={ setMeta } />
			) }
		</div>
	);
}

/**
 * Featured Readers "Month & Year": blank = current month. Shows how many
 * recommendations match, so a typo is obvious right away.
 */
function MonthField( { meta, setMeta }: { meta: Meta; setMeta: SetMeta } ) {
	const [ count, setCount ] = useState< number | null >( null );
	const value = meta._featured_month_year;

	useEffect( () => {
		let live = true;
		const t = window.setTimeout( () => {
			previewSource( 'featured_readers', value )
				.then( ( r ) => live && setCount( r.items.length ) )
				.catch( () => live && setCount( null ) );
		}, 400 );
		return () => {
			live = false;
			window.clearTimeout( t );
		};
	}, [ value ] );

	let help =
		'Blank = whatever month it is. Or pin a month, e.g. “September 2025”.';
	if ( count !== null ) {
		help += ` ${ count } recommendation${ count === 1 ? '' : 's' } match right now.`;
	}
	return (
		<TextControl
			__next40pxDefaultSize
			__nextHasNoMarginBottom
			label="Month & Year"
			placeholder="Current month"
			help={ help }
			value={ value }
			onChange={ ( v ) => setMeta( { _featured_month_year: v } ) }
		/>
	);
}

function ColorField( {
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: ( v: string ) => void;
} ) {
	const id = `wots-color-${ label.replace( /\W+/g, '-' ).toLowerCase() }`;
	return (
		<BaseControl __nextHasNoMarginBottom id={ id } label={ label }>
			<div className="wots-color">
				<input
					id={ id }
					type="color"
					value={ value || '#ffffff' }
					onChange={ ( e ) => onChange( e.target.value ) }
				/>
				<code>{ value }</code>
			</div>
		</BaseControl>
	);
}

/**
 * Background image behind the panel, panel tint, and text colors (ported
 * from the Next.js block settings).
 */
export function PanelSettings( {
	meta,
	setMeta,
}: {
	meta: Meta;
	setMeta: SetMeta;
} ) {
	return (
		<fieldset className="wots-fieldset">
			<legend>Look</legend>
			<BaseControl
				__nextHasNoMarginBottom
				id="wots-bg"
				label="Background image"
				help="Fills the screen behind the panel."
			>
				<MediaPicker
					kind="image"
					value={ meta._bg_image_id }
					onChange={ ( id ) => setMeta( { _bg_image_id: id } ) }
				/>
				{ meta._bg_image_id > 0 && (
					<button
						type="button"
						className="button-link wots-remove-link"
						onClick={ () => setMeta( { _bg_image_id: 0 } ) }
					>
						Remove background
					</button>
				) }
			</BaseControl>
			<div className="wots-row">
				<ColorField
					label="Panel color"
					value={ meta._panel_color }
					onChange={ ( v ) => setMeta( { _panel_color: v } ) }
				/>
				<RangeControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Panel opacity"
					min={ 0 }
					max={ 100 }
					value={ meta._panel_opacity }
					onChange={ ( v ) => setMeta( { _panel_opacity: v ?? 60 } ) }
				/>
			</div>
			<div className="wots-row wots-row--3">
				<ColorField
					label="Title"
					value={ meta._title_color }
					onChange={ ( v ) => setMeta( { _title_color: v } ) }
				/>
				<ColorField
					label="Body"
					value={ meta._body_color }
					onChange={ ( v ) => setMeta( { _body_color: v } ) }
				/>
				<ColorField
					label="Date / meta"
					value={ meta._meta_color }
					onChange={ ( v ) => setMeta( { _meta_color: v } ) }
				/>
			</div>
		</fieldset>
	);
}

const TRANSITION_LABELS: Record< string, string > = {
	cut: 'Cut',
	crossfade: 'Crossfade',
	slide: 'Slide',
	zoom: 'Zoom',
};
const ANIMATION_LABELS: Record< string, string > = {
	none: 'None',
	fade: 'Fade',
	slide: 'Slide up',
	zoom: 'Zoom',
};

/** Block transition (every type) and content animation (dynamic only). */
export function MotionSettings( {
	meta,
	setMeta,
	dynamic,
}: {
	meta: Meta;
	setMeta: SetMeta;
	dynamic: boolean;
} ) {
	const { settings } = adminConfig();
	return (
		<div className="wots-row">
			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Transition in"
				value={ meta._transition }
				options={ [
					{
						value: '',
						label: `Default (${ TRANSITION_LABELS[ settings.block_transition ] ?? settings.block_transition })`,
					},
					...Object.entries( TRANSITION_LABELS ).map(
						( [ value, label ] ) => ( { value, label } )
					),
				] }
				onChange={ ( v ) => setMeta( { _transition: v } ) }
			/>
			{ dynamic && (
				<SelectControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label="Content animation"
					value={ meta._content_animation }
					options={ [
						{
							value: '',
							label: `Default (${ ANIMATION_LABELS[ settings.content_animation ] ?? settings.content_animation })`,
						},
						...Object.entries( ANIMATION_LABELS ).map(
							( [ value, label ] ) => ( { value, label } )
						),
					] }
					onChange={ ( v ) => setMeta( { _content_animation: v } ) }
				/>
			) }
		</div>
	);
}
