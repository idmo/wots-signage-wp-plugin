import {
	Button,
	Modal,
	SelectControl,
	TextControl,
} from '@wordpress/components';
import { useState } from '@wordpress/element';
import type { ShowSummary } from './api';

interface Props {
	shows: ShowSummary[];
	currentId: number;
	busy: boolean;
	onSelect: ( id: number ) => void;
	onGoLive: ( id: number ) => void;
	onCreate: ( title: string ) => void;
	onRename: ( id: number, title: string ) => void;
	onDuplicate: ( id: number ) => void;
	onDelete: ( id: number ) => void;
}

type Dialog =
	{ kind: 'new' | 'rename'; value: string } | { kind: 'delete' } | null;

/**
 * Pick which show to edit, and manage shows (PRD §9.3). One show is live
 * at a time; "Go live" switches the TV at its next check.
 */
export function ShowsBar( {
	shows,
	currentId,
	busy,
	onSelect,
	onGoLive,
	onCreate,
	onRename,
	onDuplicate,
	onDelete,
}: Props ) {
	const [ dialog, setDialog ] = useState< Dialog >( null );
	const current = shows.find( ( s ) => s.id === currentId );

	return (
		<div className="wots-showsbar">
			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Editing show"
				value={ String( currentId ) }
				options={ shows.map( ( s ) => ( {
					value: String( s.id ),
					label: `${ s.title }${ s.is_live ? ' — live' : '' } (${ s.count })`,
				} ) ) }
				onChange={ ( v ) => onSelect( Number( v ) ) }
			/>
			{ current?.is_live ? (
				<span className="wots-badge wots-badge--active wots-live">
					Playing on the TV
				</span>
			) : (
				<Button
					variant="primary"
					disabled={ busy }
					onClick={ () => onGoLive( currentId ) }
				>
					Go live
				</Button>
			) }
			<span className="wots-spacer" />
			<Button
				variant="tertiary"
				disabled={ busy }
				onClick={ () => setDialog( { kind: 'new', value: '' } ) }
			>
				New show
			</Button>
			<Button
				variant="tertiary"
				disabled={ busy || ! current }
				onClick={ () =>
					setDialog( { kind: 'rename', value: current?.title ?? '' } )
				}
			>
				Rename
			</Button>
			<Button
				variant="tertiary"
				disabled={ busy || ! current }
				onClick={ () => onDuplicate( currentId ) }
			>
				Duplicate
			</Button>
			<Button
				variant="tertiary"
				isDestructive
				disabled={ busy || ! current || current.is_live }
				label={
					current?.is_live ? 'Put another show live first' : undefined
				}
				showTooltip={ !! current?.is_live }
				onClick={ () => setDialog( { kind: 'delete' } ) }
			>
				Delete
			</Button>

			{ dialog &&
				( dialog.kind === 'new' || dialog.kind === 'rename' ) && (
					<Modal
						title={
							dialog.kind === 'new' ? 'New show' : 'Rename show'
						}
						onRequestClose={ () => setDialog( null ) }
						size="small"
					>
						<form
							onSubmit={ ( e ) => {
								e.preventDefault();
								const title = dialog.value.trim();
								if ( ! title ) {
									return;
								}
								if ( dialog.kind === 'new' ) {
									onCreate( title );
								} else {
									onRename( currentId, title );
								}
								setDialog( null );
							} }
						>
							<TextControl
								__next40pxDefaultSize
								__nextHasNoMarginBottom
								label="Name"
								value={ dialog.value }
								onChange={ ( v ) =>
									setDialog( { ...dialog, value: v } )
								}
							/>
							<div className="wots-modal-actions">
								<span className="wots-spacer" />
								<Button
									variant="tertiary"
									onClick={ () => setDialog( null ) }
								>
									Cancel
								</Button>
								<Button
									variant="primary"
									type="submit"
									disabled={ ! dialog.value.trim() }
								>
									{ dialog.kind === 'new'
										? 'Create'
										: 'Rename' }
								</Button>
							</div>
						</form>
					</Modal>
				) }

			{ dialog?.kind === 'delete' && current && (
				<Modal
					title={ `Delete “${ current.title }”?` }
					onRequestClose={ () => setDialog( null ) }
					size="small"
				>
					<p>The show is removed. Its blocks stay in the library.</p>
					<div className="wots-modal-actions">
						<span className="wots-spacer" />
						<Button
							variant="tertiary"
							onClick={ () => setDialog( null ) }
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							isDestructive
							onClick={ () => {
								onDelete( currentId );
								setDialog( null );
							} }
						>
							Delete show
						</Button>
					</div>
				</Modal>
			) }
		</div>
	);
}
