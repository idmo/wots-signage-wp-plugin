import type { CSSProperties } from 'react';
import { useEffect, useState } from '@wordpress/element';
import type { StageSize } from './types';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const DEFAULT_STAGE: StageSize = {
	aspect: '16:9',
	width: STAGE_W,
	height: STAGE_H,
};

/**
 * A fixed canvas (1920×1080 for 16:9, 1080×1920 for 9:16, …) scaled to fit
 * its container, so layouts look the same at 1080p, 4K, or in a small admin
 * preview.
 */
export function Stage( {
	children,
	fill = 'window',
	size = DEFAULT_STAGE,
}: {
	children: React.ReactNode;
	fill?: 'window' | 'parent';
	size?: StageSize;
} ) {
	const [ ref, setRef ] = useState< HTMLDivElement | null >( null );
	const [ scale, setScale ] = useState( 1 );
	const { width, height } = size;

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
				setScale( Math.min( w / width, h / height ) );
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
	}, [ ref, fill, width, height ] );

	return (
		<div className="wots-stage-frame" ref={ setRef }>
			<div
				className={ `wots-stage${ height > width ? ' is-portrait' : '' }` }
				style={
					{
						width,
						height,
						'--wots-stage-w': `${ width }px`,
						'--wots-stage-h': `${ height }px`,
						transform: `translate(-50%, -50%) scale(${ scale })`,
					} as CSSProperties
				}
			>
				{ children }
			</div>
		</div>
	);
}
