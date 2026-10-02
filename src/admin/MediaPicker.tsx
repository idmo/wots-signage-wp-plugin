import { Button } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { getMedia, type MediaInfo } from './api';

interface Props {
	kind: 'image' | 'video';
	value: number;
	onChange: ( id: number, info: MediaInfo | null ) => void;
	/** Called once details for an already-selected attachment have loaded. */
	onInfo?: ( info: MediaInfo | null ) => void;
}

/**
 * Opens the WordPress media library (PRD §3: assets are always attachments).
 */
export function MediaPicker( { kind, value, onChange, onInfo }: Props ) {
	const [ info, setInfo ] = useState< MediaInfo | null >( null );

	useEffect( () => {
		let live = true;
		if ( value && info?.id !== value ) {
			getMedia( value ).then( ( m ) => {
				if ( live ) {
					setInfo( m );
					onInfo?.( m );
				}
			} );
		}
		if ( ! value ) {
			setInfo( null );
		}
		return () => {
			live = false;
		};
	}, [ value ] ); // eslint-disable-line react-hooks/exhaustive-deps

	const open = () => {
		const frame = window.wp.media( {
			title: kind === 'image' ? 'Choose an image' : 'Choose a video',
			button: { text: 'Use this' },
			library: { type: kind },
			multiple: false,
		} );
		frame.on( 'open', () => {
			if ( value ) {
				const selection = frame.state().get( 'selection' );
				selection.reset( [ window.wp.media.attachment( value ) ] );
			}
		} );
		frame.on( 'select', () => {
			const a = frame.state().get( 'selection' ).first().toJSON();
			const picked: MediaInfo = {
				id: a.id,
				url: a.url,
				thumb:
					a.sizes?.medium?.url ||
					( kind === 'image' ? a.url : a.image?.src || '' ),
				mime: a.mime,
				title: a.title,
				length: a.fileLength ? parseLength( a.fileLength ) : null,
			};
			setInfo( picked );
			onChange( a.id, picked );
		} );
		frame.open();
	};

	return (
		<div className="wots-media-picker">
			{ info && kind === 'image' && info.thumb && (
				<img src={ info.thumb } alt="" />
			) }
			{ info && kind === 'video' && (
				<video
					src={ info.url }
					muted
					controls
					preload="metadata"
					className="wots-media-picker__video"
				/>
			) }
			<div className="wots-media-picker__actions">
				<Button variant="secondary" onClick={ open }>
					{ value ? `Replace ${ kind }` : `Choose ${ kind }` }
				</Button>
				{ info && (
					<span className="wots-media-picker__name">
						{ info.title }
					</span>
				) }
			</div>
		</div>
	);
}

/** "1:05" or "0:06" → seconds. */
function parseLength( text: string ): number | null {
	const parts = String( text ).split( ':' ).map( Number );
	if ( parts.some( Number.isNaN ) ) {
		return null;
	}
	return parts.reduce( ( acc, n ) => acc * 60 + n, 0 );
}
