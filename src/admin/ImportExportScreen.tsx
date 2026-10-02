import {
	Button,
	CheckboxControl,
	Notice,
	SelectControl,
} from '@wordpress/components';
import { useState } from '@wordpress/element';
import {
	adminConfig,
	analyzeImport,
	commitImport,
	type ImportAnalysis,
	type ImportDecision,
	type ShowSummary,
} from './api';

interface Props {
	shows: ShowSummary[];
	onImported: ( message: string ) => void;
}

const KIND_LABEL = {
	template: 'Template',
	block: 'Block',
	show: 'Show',
} as const;

const plural = ( n: number, word: string ) =>
	`${ n } ${ word }${ n === 1 ? '' : 's' }`;

/** Backups and moving shows between sites (PRD §14). */
export function ImportExportScreen( { shows, onImported }: Props ) {
	const { exportUrl, maxUpload } = adminConfig();
	const [ showId, setShowId ] = useState(
		shows.find( ( s ) => s.is_live )?.id ?? shows[ 0 ]?.id ?? 0
	);
	const [ analysis, setAnalysis ] = useState< ImportAnalysis | null >( null );
	const [ decisions, setDecisions ] = useState<
		Record< string, ImportDecision >
	>( {} );
	const [ withSettings, setWithSettings ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );

	const pick = async ( file: File | undefined ) => {
		if ( ! file ) {
			return;
		}
		setError( '' );
		setAnalysis( null );
		if ( maxUpload && file.size > maxUpload ) {
			setError(
				`That file is ${ Math.round( file.size / 1048576 ) } MB; this site accepts uploads up to ${ Math.round( maxUpload / 1048576 ) } MB.`
			);
			return;
		}
		setBusy( true );
		try {
			const result = await analyzeImport( file );
			setAnalysis( result );
			// Merge by default: keep what's already here.
			setDecisions(
				Object.fromEntries(
					result.conflicts.map( ( c ) => [
						`${ c.kind }:${ c.ref }`,
						'skip' as ImportDecision,
					] )
				)
			);
		} catch ( e ) {
			setError( ( e as Error ).message );
		} finally {
			setBusy( false );
		}
	};

	const run = async () => {
		if ( ! analysis ) {
			return;
		}
		setBusy( true );
		setError( '' );
		try {
			const r = await commitImport(
				analysis.token,
				decisions,
				withSettings
			);
			setAnalysis( null );
			onImported(
				`Import finished: ${ plural( r.created, 'item' ) } added, ${ r.updated } updated, ${ r.skipped } kept as they were, ${ plural( r.media, 'new media file' ) }.`
			);
		} catch ( e ) {
			setError( ( e as Error ).message );
		} finally {
			setBusy( false );
		}
	};

	return (
		<div className="wots-transfer">
			<section className="wots-card">
				<h2>Export</h2>
				<p className="wots-hint">
					A zip with a manifest and every image and video used. The
					player key is never included.
				</p>
				<div className="wots-transfer__row">
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Show"
						value={ String( showId ) }
						options={ shows.map( ( s ) => ( {
							value: String( s.id ),
							label: s.title,
						} ) ) }
						onChange={ ( v ) => setShowId( Number( v ) ) }
					/>
					<Button
						variant="secondary"
						href={ `${ exportUrl }&sequence=${ showId }` }
						disabled={ ! showId }
					>
						Export this show
					</Button>
				</div>
				<p>
					<Button
						variant="secondary"
						href={ `${ exportUrl }&full=1` }
					>
						Export everything
					</Button>{ ' ' }
					<span className="wots-hint">
						All shows, blocks, templates, categories, and settings.
					</span>
				</p>
			</section>

			<section className="wots-card">
				<h2>Import</h2>
				<p className="wots-hint">
					Choose a signage export. Nothing changes until you confirm.
					Images and videos already in your library are reused, not
					copied again.
				</p>
				<input
					type="file"
					accept=".zip,application/zip"
					disabled={ busy }
					onChange={ ( e ) => pick( e.target.files?.[ 0 ] ) }
					aria-label="Signage export file"
				/>

				{ error && (
					<Notice status="error" isDismissible={ false }>
						{ error }
					</Notice>
				) }

				{ analysis && (
					<div className="wots-import">
						<p>
							{ analysis.kind === 'full'
								? 'Full backup'
								: 'Show export' }{ ' ' }
							from <code>{ analysis.site }</code>:{ ' ' }
							{ plural( analysis.counts.shows, 'show' ) },{ ' ' }
							{ plural( analysis.counts.blocks, 'block' ) },{ ' ' }
							{ plural( analysis.counts.templates, 'template' ) },{ ' ' }
							{ plural( analysis.counts.media, 'media file' ) }
							{ analysis.counts.media_reused > 0 &&
								` (${ analysis.counts.media_reused } already in your library)` }
							.
						</p>

						{ analysis.conflicts.length > 0 ? (
							<>
								<h3>Already here</h3>
								<p className="wots-hint">
									These names exist on this site. Choose what
									to do with each.
								</p>
								<table className="widefat striped wots-table">
									<tbody>
										{ analysis.conflicts.map( ( c ) => {
											const key = `${ c.kind }:${ c.ref }`;
											return (
												<tr key={ key }>
													<td>
														{ KIND_LABEL[ c.kind ] }
													</td>
													<td>{ c.title }</td>
													<td>
														<SelectControl
															__next40pxDefaultSize
															__nextHasNoMarginBottom
															label={ `What to do with ${ c.title }` }
															hideLabelFromVision
															value={
																decisions[
																	key
																] ?? 'skip'
															}
															options={ [
																{
																	value: 'skip',
																	label: 'Keep mine (skip)',
																},
																{
																	value: 'overwrite',
																	label: 'Replace mine',
																},
																{
																	value: 'copy',
																	label: 'Import as a copy',
																},
															] }
															onChange={ ( v ) =>
																setDecisions( {
																	...decisions,
																	[ key ]:
																		v as ImportDecision,
																} )
															}
														/>
													</td>
												</tr>
											);
										} ) }
									</tbody>
								</table>
							</>
						) : (
							<p>No name conflicts. Everything will be added.</p>
						) }

						{ analysis.settings && (
							<CheckboxControl
								__nextHasNoMarginBottom
								label="Also replace my settings (poll interval, durations, colors, transitions)"
								checked={ withSettings }
								onChange={ setWithSettings }
							/>
						) }
						<p className="wots-hint">
							Imported shows are not put live. Use Go live on the
							Shows tab.
						</p>
						<div className="wots-transfer__row">
							<Button
								variant="primary"
								onClick={ run }
								isBusy={ busy }
								disabled={ busy }
							>
								Import
							</Button>
							<Button
								variant="tertiary"
								onClick={ () => setAnalysis( null ) }
								disabled={ busy }
							>
								Cancel
							</Button>
						</div>
					</div>
				) }
			</section>
		</div>
	);
}
