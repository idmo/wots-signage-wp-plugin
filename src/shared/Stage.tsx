import { useEffect, useState } from '@wordpress/element';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/**
 * A fixed 1920×1080 canvas scaled to fit its container, so layouts look the
 * same at 1080p, 4K, or in a small admin preview.
 */
export function Stage( {
	children,
	fill = 'window',
}: {
	children: React.ReactNode;
	fill?: 'window' | 'parent';
} ) {
	const [ ref, setRef ] = useState< HTMLDivElement | null >( null );
	const [ scale, setScale ] = useState( 1 );

	useEffect( () => {
		const measure = () => {
			const w =
				fill === 'window'
					? window.innerWidth
					: ( ref?.clientWidth ?? 0 );
			const h =
				fill === 'window'
					? window.innerHeight
					: ( ref?.clientHeight ?? 0 );
			if ( w && h ) {
				setScale( Math.min( w / STAGE_W, h / STAGE_H ) );
			}
		};
		measure();
		if ( fill === 'window' ) {
			window.addEventListener( 'resize', measure );
			return () => window.removeEventListener( 'resize', measure );
		}
		if ( ! ref ) {
			return;
		}
		const observer = new ResizeObserver( measure );
		observer.observe( ref );
		return () => observer.disconnect();
	}, [ ref, fill ] );

	return (
		<div className="wots-stage-frame" ref={ setRef }>
			<div
				className="wots-stage"
				style={ {
					transform: `translate(-50%, -50%) scale(${ scale })`,
				} }
			>
				{ children }
			</div>
		</div>
	);
}
