import { LiveFollowers, MediaView } from './Instagram';
import { Qr } from './Qr';
import {
	META_KEYS,
	TEMPLATE_LAYOUTS,
	TITLE_KEYS,
	gridStyle,
} from './templates';
import type {
	ElementPlacement,
	Fields,
	ImageAsset,
	MediaAsset,
	ResolvedTemplate,
} from './types';

/**
 * A Template Builder layout for one item (PRD §7): a CSS grid of the
 * chosen layout, each region stacking its elements in order. Shared by the
 * player and the builder's live preview, so what you see is what plays.
 */
export function TemplateSlide( {
	template,
	fields,
	elementTypes,
}: {
	template: Pick< ResolvedTemplate, 'layout' | 'regions' | 'design' >;
	fields: Fields;
	/** element key → type, from the data source's palette. */
	elementTypes?: Record< string, string >;
} ) {
	const layout =
		TEMPLATE_LAYOUTS[ template.layout ] ?? TEMPLATE_LAYOUTS.stack;
	return (
		<div
			className="wots-tpl"
			style={ gridStyle( template.layout, template.design ) }
		>
			{ layout.regions.map( ( region ) => (
				<div
					key={ region }
					className="wots-tpl__region"
					style={ { gridArea: region } }
				>
					{ ( template.regions[ region ] ?? [] ).map(
						( placement, i ) => (
							<ElementRenderer
								key={ `${ region }-${ placement.element }-${ i }` }
								placement={ placement }
								type={
									elementTypes?.[ placement.element ] ??
									guessType( placement.element )
								}
								value={ fields[ placement.element ] }
							/>
						)
					) }
				</div>
			) ) }
		</div>
	);
}

/** Fallback when no palette is at hand (e.g. an imported template). */
function guessType( key: string ): string {
	if ( key === 'free_text' ) {
		return 'static';
	}
	if ( key === 'qr_code' ) {
		return 'qr';
	}
	if ( key.endsWith( '_html' ) ) {
		return 'html';
	}
	if ( key === 'media' ) {
		return 'media';
	}
	if ( key === 'followers' ) {
		return 'followers';
	}
	if ( /image|cover|photo/.test( key ) ) {
		return 'image';
	}
	return 'text';
}

/**
 * One element. Missing data renders nothing, except images, which fall back
 * to a solid block in the brand/panel color so the layout keeps its shape.
 */
export function ElementRenderer( {
	placement,
	type,
	value,
}: {
	placement: ElementPlacement;
	type: string;
	value: unknown;
} ) {
	const { element, options } = placement;
	const align = options?.align ? ` is-${ options.align }` : '';
	const size = options?.size ? ` is-size-${ options.size }` : '';

	if ( type === 'static' ) {
		const text = options?.text?.trim();
		if ( ! text ) {
			return null;
		}
		return (
			<p
				className={ `wots-el wots-el--${ options?.role ?? 'meta' } is-free${ align }${ size }` }
			>
				{ text }
			</p>
		);
	}

	if ( type === 'media' ) {
		return (
			<MediaView
				media={ value as MediaAsset | null }
				fit={ options?.fit ?? 'cover' }
				className="wots-el wots-el--image"
			/>
		);
	}

	if ( type === 'followers' ) {
		return (
			<p
				className={ `wots-el wots-el--title is-followers${ align }${ size }` }
			>
				<LiveFollowers initial={ Number( value ) || 0 } />
			</p>
		);
	}

	if ( type === 'image' ) {
		const image = value as ImageAsset | null;
		if ( ! image?.url ) {
			return <div className="wots-el wots-el--image is-empty" />;
		}
		return (
			<img
				className={ `wots-el wots-el--image is-${ options?.fit ?? 'cover' }` }
				src={ image.url }
				alt={ image.alt || '' }
			/>
		);
	}

	if ( value === null || value === undefined || value === '' ) {
		return null;
	}

	if ( type === 'qr' ) {
		return (
			<div className={ `wots-el wots-el--qr${ align }` }>
				<Qr value={ String( value ) } className="wots-qr-card" />
			</div>
		);
	}

	if ( type === 'html' ) {
		return (
			<div
				className={ `wots-el wots-el--html${ align }${ size }` }
				// Sanitized server-side with wp_kses_post().
				dangerouslySetInnerHTML={ { __html: String( value ) } }
			/>
		);
	}

	let role = 'body';
	if ( TITLE_KEYS.includes( element ) ) {
		role = 'title';
	} else if ( META_KEYS.includes( element ) ) {
		role = 'meta';
	}
	return (
		<p className={ `wots-el wots-el--${ role }${ align }${ size }` }>
			{ String( value ) }
		</p>
	);
}
