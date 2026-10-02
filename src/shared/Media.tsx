import type { FitMode, ImageAsset, VideoAsset } from './types';

/**
 * Full-frame image with the three fit modes from PRD §3.
 */
export function FitImage( {
	image,
	fit,
}: {
	image: ImageAsset;
	fit: FitMode;
} ) {
	return (
		<div className={ `wots-media wots-fit-${ fit }` }>
			{ fit === 'contain-blur' && (
				<img
					className="wots-media__blur"
					src={ image.url }
					alt=""
					aria-hidden="true"
				/>
			) }
			<img
				className="wots-media__main"
				src={ image.url }
				alt={ image.alt || '' }
			/>
		</div>
	);
}

interface FitVideoProps {
	video: VideoAsset;
	fit: FitMode;
	onEnded?: () => void;
	onError?: ( message: string ) => void;
}

export function FitVideo( { video, fit, onEnded, onError }: FitVideoProps ) {
	return (
		<div className={ `wots-media wots-fit-${ fit }` }>
			{ fit === 'contain-blur' && video.poster && (
				<img
					className="wots-media__blur"
					src={ video.poster.url }
					alt=""
					aria-hidden="true"
				/>
			) }
			<video
				className="wots-media__main"
				src={ video.url }
				poster={ video.poster?.url }
				autoPlay
				muted
				playsInline
				preload="auto"
				onEnded={ onEnded }
				onError={ () =>
					onError?.( `Video failed to load: ${ video.url }` )
				}
			/>
		</div>
	);
}
