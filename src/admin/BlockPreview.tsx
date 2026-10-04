import { Button, Modal, Notice, Spinner } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';
import { Player, type PlayerControls } from '../player/Player';
import type { Playlist } from '../shared/types';
import { adminConfig, previewBlock, type BlockRecord } from './api';

interface Props {
	/** Saved block to preview; 0 for a block that hasn't been saved yet. */
	blockId: number;
	/** Unsaved values from the editor. Omit to preview the saved block. */
	record?: BlockRecord;
	title: string;
	onClose: () => void;
}

/**
 * Plays one block on its own, with the real player, so its layout and
 * timing can be checked without sitting through the whole show. Dates and
 * status are ignored: a scheduled or expired block still previews.
 */
export function BlockPreview( { blockId, record, title, onClose }: Props ) {
	const [ playlist, setPlaylist ] = useState< Playlist | null >( null );
	const [ error, setError ] = useState( '' );
	const [ position, setPosition ] = useState( { index: 0, total: 0 } );
	const [ label, setLabel ] = useState( '' );
	const [ paused, setPaused ] = useState( false );
	const controls = useRef< PlayerControls | null >( null );
	const stage = adminConfig().stage;

	useEffect( () => {
		let live = true;
		previewBlock( blockId, record )
			.then( ( p ) => live && setPlaylist( p ) )
			.catch( ( e ) => live && setError( ( e as Error ).message ) );
		return () => {
			live = false;
		};
		// The record is a snapshot taken when the preview opens.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ blockId ] );

	const count = playlist?.items.length ?? 0;

	return (
		<Modal
			title={ `Preview: ${ title || 'New block' }` }
			onRequestClose={ onClose }
			className="wots-block-preview"
			size="large"
		>
			{ error && (
				<Notice status="error" isDismissible={ false }>
					{ error }
				</Notice>
			) }
			{ ! playlist && ! error && <Spinner /> }
			{ playlist && (
				<>
					<div
						className="wots-preview-player"
						style={ {
							aspectRatio: `${ stage.width } / ${ stage.height }`,
							// Portrait screens: fit the height, not the width.
							width: `min(100%, calc(52vh * ${
								stage.width / stage.height
							}))`,
						} }
					>
						<Player
							preview={ playlist }
							fill="parent"
							controls={ controls }
							onItem={ ( index, total, itemLabel ) => {
								setPosition( { index, total } );
								setLabel( itemLabel );
							} }
						/>
					</div>
					<div className="wots-block-preview__bar">
						<Button
							variant="secondary"
							disabled={ count < 2 }
							onClick={ () => controls.current?.step( -1 ) }
						>
							‹ Previous
						</Button>
						<Button
							variant="secondary"
							onClick={ () => {
								controls.current?.setPaused( ! paused );
								setPaused( ! paused );
							} }
						>
							{ paused ? 'Play' : 'Pause' }
						</Button>
						<Button
							variant="secondary"
							disabled={ count < 2 }
							onClick={ () => controls.current?.step( 1 ) }
						>
							Next ›
						</Button>
						<span className="wots-subtle">
							{ count === 0 &&
								'This block has nothing to show right now.' }
							{ count === 1 && label }
							{ count > 1 &&
								`${ position.index + 1 } of ${ position.total } · ${ label }` }
						</span>
						<span className="wots-spacer" />
						<span className="wots-subtle">
							← → to step · Space to pause
						</span>
					</div>
					{ record && (
						<p className="wots-hint">
							Showing your unsaved changes. Dates and archive
							status are ignored here.
						</p>
					) }
				</>
			) }
		</Modal>
	);
}
