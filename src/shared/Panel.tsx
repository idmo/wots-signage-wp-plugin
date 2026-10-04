import type { CSSProperties, ReactNode } from 'react';
import { Qr } from './Qr';
import type { ImageAsset, PanelStyle } from './types';

/** #rgb / #rrggbb + 0–100 opacity → rgba(). */
export function hexToRgba( hex: string, opacity: number ): string {
	const clean = ( hex || '#000000' ).replace( '#', '' );
	const full =
		clean.length === 3
			? clean
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: clean;
	const channel = ( i: number ) => {
		const v = parseInt( full.slice( i, i + 2 ), 16 );
		return Number.isNaN( v ) ? 0 : v;
	};
	const [ r, g, b ] = [ channel( 0 ), channel( 2 ), channel( 4 ) ];
	const a = Math.min( 100, Math.max( 0, opacity ) ) / 100;
	return `rgba(${ r }, ${ g }, ${ b }, ${ a })`;
}

/** CSS variables carrying a block's text colors into its content. */
export function panelVars( panel: PanelStyle ): CSSProperties {
	return {
		'--wots-title': panel.title || '#ffffff',
		'--wots-body': panel.body || '#ffffff',
		'--wots-meta': panel.meta || '#ffffff',
	} as CSSProperties;
}

/**
 * The full-bleed background. Normally the block's own image, rendered once
 * per block so it stays put while the carousel content changes in front of
 * it. A template can instead use each item's own image (e.g. the event's
 * featured image); that one fades in as items change.
 */
export function PanelBackground( {
	panel,
	image,
	dim = 0,
}: {
	panel: PanelStyle;
	/** Per-item image from the template's background element. */
	image?: ImageAsset | null;
	/** 0–90: dark overlay over the image, in percent. */
	dim?: number;
} ) {
	const bg = image?.url ? image : panel.background;
	return (
		<div className="wots-panel-bg">
			{ bg && (
				<img
					key={ bg.url }
					className={ image?.url ? 'is-item' : undefined }
					src={ bg.url }
					alt=""
					aria-hidden="true"
				/>
			) }
			{ bg && dim > 0 && (
				<div
					className="wots-panel-bg__dim"
					style={ { opacity: Math.min( 90, dim ) / 100 } }
				/>
			) }
		</div>
	);
}

/** The template's per-item background image and dim, if it has one. */
export function itemBackground(
	template: { design?: { background: string; dim: number } } | null,
	fields: Record< string, unknown > | undefined
): { image: ImageAsset | null; dim: number } {
	const key = template?.design?.background;
	const image = key ? ( fields?.[ key ] as ImageAsset | null ) : null;
	return image?.url
		? { image, dim: template?.design?.dim ?? 0 }
		: { image: null, dim: 0 };
}

/**
 * The tinted, centered panel holding a slide's content. Keyed by
 * `contentKey` so a new item replays the entrance animation.
 */
export function PanelBox( {
	panel,
	wide,
	contentKey,
	children,
}: {
	panel: PanelStyle;
	/** List and template slides run taller than a single built-in card. */
	wide?: boolean;
	contentKey: string;
	children: ReactNode;
} ) {
	const anim =
		panel.animation && panel.animation !== 'none'
			? ` wots-anim-${ panel.animation }`
			: '';
	return (
		<div className="wots-panel-wrap">
			<div
				key={ contentKey }
				className={ `wots-panel${ wide ? ' is-wide' : '' }${ anim }` }
				style={ {
					...panelVars( panel ),
					backgroundColor: hexToRgba( panel.color, panel.opacity ),
					animationDuration: `${ panel.animation_ms }ms`,
				} }
			>
				{ children }
			</div>
		</div>
	);
}

/** Text ¾ + QR ¼, with the QR on its own white card so it always scans. */
export function QrColumn( { url, caption }: { url: string; caption: string } ) {
	return (
		<div className="wots-qr-col">
			<Qr value={ url } className="wots-qr-card" />
			<span>{ caption }</span>
		</div>
	);
}

/** The item's own image as a 16:9 banner above the text. */
export function Banner( { image }: { image: ImageAsset | null | undefined } ) {
	if ( ! image?.url ) {
		return null;
	}
	return (
		<div className="wots-banner">
			<img src={ image.url } alt={ image.alt || '' } />
		</div>
	);
}
