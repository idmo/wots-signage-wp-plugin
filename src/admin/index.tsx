import { Button, Notice, Spinner, TabPanel } from '@wordpress/components';
import {
	createRoot,
	useCallback,
	useEffect,
	useRef,
	useState,
} from '@wordpress/element';
import {
	NS,
	api,
	createShow,
	deleteShow,
	duplicateShow,
	getBlocks,
	getCategories,
	getDataSources,
	getShow,
	getShowById,
	getShows,
	getStatus,
	getTemplates,
	getTimeline,
	refreshNow,
	renameShow,
	saveLineup,
	savePeriods,
	saveShowItems,
	saveTimeline,
	type AdminStatus,
	type BlockSummary,
	type Category,
	type DataSourceInfo,
	type LiveShow,
	type ShowItem,
	type ShowSummary,
	type TemplateSummary,
	type TimelineData,
	type TimelineItem,
	type Period,
} from './api';
import { BlockEditor } from './BlockEditor';
import { BlockPreview } from './BlockPreview';
import { BlocksScreen } from './BlocksScreen';
import { playerHealth } from './common';
import { ImportExportScreen } from './ImportExportScreen';
import { lineupIds } from './LineupPanel';
import { PreviewScreen } from './PreviewScreen';
import { ShowScreen } from './ShowScreen';
import { ShowsBar } from './ShowsBar';
import { TemplatesScreen } from './TemplatesScreen';
import { TimelineScreen } from './TimelineScreen';
import { setFollowerFetcher } from '../shared/live';
import './style.css';

type Editing = { id: number | null } | null;

function App() {
	const [ show, setShow ] = useState< LiveShow | null >( null );
	const [ shows, setShows ] = useState< ShowSummary[] >( [] );
	const [ blocks, setBlocks ] = useState< BlockSummary[] >( [] );
	const [ templates, setTemplates ] = useState< TemplateSummary[] >( [] );
	const [ categories, setCategories ] = useState< Category[] >( [] );
	const [ dataSources, setDataSources ] = useState< DataSourceInfo[] >( [] );
	const [ status, setStatus ] = useState< AdminStatus | null >( null );
	const [ editing, setEditing ] = useState< Editing >( null );
	const [ previewing, setPreviewing ] = useState< number | null >( null );
	const [ error, setError ] = useState( '' );
	const [ notice, setNotice ] = useState( '' );
	const [ savingShow, setSavingShow ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ refreshing, setRefreshing ] = useState( false );
	const [ timeline, setTimeline ] = useState< TimelineData | null >( null );
	const [ savingTimeline, setSavingTimeline ] = useState( false );
	const [ tab, setTab ] = useState( { name: 'timeline', n: 0 } );
	const timelineQueue = useRef< Promise< unknown > >( Promise.resolve() );
	const saveQueue = useRef< Promise< unknown > >( Promise.resolve() );

	const fail = ( e: unknown ) =>
		setError( e instanceof Error ? e.message : String( e ) );

	const loadBlocks = useCallback(
		() => getBlocks().then( setBlocks ).catch( fail ),
		[]
	);
	const loadShows = useCallback(
		() => getShows().then( setShows ).catch( fail ),
		[]
	);
	const loadTimeline = useCallback(
		() => getTimeline().then( setTimeline ).catch( fail ),
		[]
	);
	const loadTemplates = useCallback(
		() => getTemplates().then( setTemplates ).catch( fail ),
		[]
	);

	useEffect( () => {
		Promise.all( [
			getShow(),
			getShows(),
			getBlocks(),
			getCategories(),
			getDataSources(),
			getTemplates(),
			getTimeline(),
		] )
			.then( ( [ s, ss, b, c, d, t, tl ] ) => {
				setTimeline( tl );
				setShow( s );
				setShows( ss );
				setBlocks( b );
				setCategories( c );
				setDataSources( d );
				setTemplates( t );
			} )
			.catch( fail );
	}, [] );

	useEffect( () => {
		const load = () =>
			getStatus()
				.then( setStatus )
				.catch( () => {} );
		load();
		const t = window.setInterval( load, 15000 );
		return () => window.clearInterval( t );
	}, [] );

	/** Optimistic update; saves run one at a time in order. */
	const updateShowItems = ( items: ShowItem[] ) => {
		if ( ! show ) {
			return;
		}
		const id = show.id;
		setShow( { ...show, items } );
		setSavingShow( true );
		saveQueue.current = saveQueue.current
			.then( () => saveShowItems( id, items ) )
			.then( () => Promise.all( [ loadBlocks(), loadShows() ] ) )
			.catch( fail )
			.finally( () => setSavingShow( false ) );
	};

	/** Run a show-management action, then reload the show list. */
	const showAction = async (
		action: () => Promise< unknown >,
		message: string,
		openId?: number
	) => {
		setBusy( true );
		try {
			await saveQueue.current;
			await action();
			await Promise.all( [ loadShows(), loadTimeline() ] );
			if ( openId ) {
				setShow( await getShowById( openId ) );
			}
			setNotice( message );
		} catch ( e ) {
			fail( e );
		} finally {
			setBusy( false );
		}
	};

	const selectShow = async ( id: number ) => {
		await saveQueue.current;
		getShowById( id ).then( setShow ).catch( fail );
	};

	/** Optimistic timeline save; saves run one at a time in order. */
	const updateTimeline = ( items: TimelineItem[] ) => {
		if ( ! timeline ) {
			return;
		}
		setTimeline( { ...timeline, items } );
		setSavingTimeline( true );
		timelineQueue.current = timelineQueue.current
			.then( () => saveTimeline( items ) )
			.then( ( res ) => {
				setTimeline( res );
				return Promise.all( [ loadShows(), loadBlocks() ] );
			} )
			.catch( ( e ) => {
				fail( e );
				loadTimeline();
			} )
			.finally( () => setSavingTimeline( false ) );
	};

	const updatePeriods = async ( periods: Period[] ) => {
		await timelineQueue.current;
		try {
			setTimeline( await savePeriods( periods ) );
			setNotice( 'Periods saved.' );
		} catch ( e ) {
			fail( e );
		}
	};

	const openShow = ( id: number ) => {
		selectShow( id );
		setTab( ( t ) => ( { name: 'show', n: t.n + 1 } ) );
	};

	/** Save the TV lineup; the list updates right away. */
	const updateLineup = async ( ids: number[] ) => {
		const before = shows;
		setShows(
			shows.map( ( s ) => {
				const i = ids.indexOf( s.id );
				return { ...s, position: i + 1, is_live: i >= 0 };
			} )
		);
		try {
			const res = await saveLineup( ids );
			setShows( res.shows );
			loadBlocks();
			loadTimeline();
		} catch ( e ) {
			setShows( before );
			fail( e );
		}
	};

	const onSaved = async (
		id: number,
		isNew: boolean,
		addToShow: boolean
	) => {
		setEditing( null );
		loadTimeline();
		if ( addToShow && show ) {
			updateShowItems( [
				...show.items,
				{ block_id: id, pinned: false },
			] );
		} else {
			await loadBlocks();
		}
		setNotice( isNew ? 'Block created.' : 'Block saved.' );
	};

	const onDeleted = ( id: number ) => {
		setEditing( null );
		loadTimeline();
		if ( show && show.items.some( ( i ) => i.block_id === id ) ) {
			updateShowItems( show.items.filter( ( i ) => i.block_id !== id ) );
		} else {
			loadBlocks();
		}
		setNotice( 'Block moved to trash.' );
	};

	const doRefresh = async () => {
		setRefreshing( true );
		try {
			await refreshNow();
			setNotice( 'The player will reload the show on its next check.' );
			getStatus().then( setStatus );
		} catch ( e ) {
			fail( e );
		} finally {
			setRefreshing( false );
		}
	};

	if ( ! show && ! error ) {
		return <Spinner />;
	}

	const health = playerHealth(
		status?.heartbeat ?? null,
		status?.now ?? Math.floor( Date.now() / 1000 )
	);
	const lineup = ( timeline?.items ?? [] )
		.filter( ( i ) => i.active )
		.map( ( i ) => i.title );

	return (
		<div className="wots-signage-admin">
			<header className="wots-header">
				<div>
					<h1>Signage</h1>
					<p className="wots-subtle">
						{ lineup.length
							? `On the TV: ${ lineup.join( ' → ' ) }`
							: 'Nothing is playing on the TV' }
					</p>
				</div>
				<span className="wots-spacer" />
				<span
					className={ `wots-health wots-health--${ health.health }` }
				>
					{ health.text }
				</span>
				<Button
					variant="secondary"
					onClick={ doRefresh }
					isBusy={ refreshing }
					disabled={ refreshing }
				>
					Refresh now
				</Button>
			</header>

			{ error && (
				<Notice status="error" onRemove={ () => setError( '' ) }>
					{ error }
				</Notice>
			) }
			{ notice && (
				<Notice status="success" onRemove={ () => setNotice( '' ) }>
					{ notice }
				</Notice>
			) }

			{ show && (
				<TabPanel
					key={ tab.n }
					className="wots-tabs"
					initialTabName={ tab.name }
					tabs={ [
						{ name: 'timeline', title: 'Timeline' },
						{ name: 'show', title: 'Shows' },
						{
							name: 'blocks',
							title: `Blocks (${ blocks.length })`,
						},
						{ name: 'templates', title: 'Templates' },
						{ name: 'preview', title: 'Preview' },
						{ name: 'transfer', title: 'Import / Export' },
					] }
				>
					{ ( current ) => {
						switch ( current.name ) {
							case 'timeline':
								return timeline ? (
									<TimelineScreen
										data={ timeline }
										shows={ shows }
										blocks={ blocks }
										saving={ savingTimeline }
										onChange={ updateTimeline }
										onSavePeriods={ updatePeriods }
										onEditShow={ openShow }
										onEditBlock={ ( id ) =>
											setEditing( { id } )
										}
										onPreviewBlock={ setPreviewing }
									/>
								) : (
									<Spinner />
								);
							case 'blocks':
								return (
									<BlocksScreen
										blocks={ blocks }
										categories={ categories }
										onEdit={ ( id ) =>
											setEditing( { id } )
										}
										onPreview={ setPreviewing }
										onNew={ () =>
											setEditing( { id: null } )
										}
									/>
								);
							case 'templates':
								return (
									<TemplatesScreen
										templates={ templates }
										dataSources={ dataSources }
										onChanged={ ( message ) => {
											setNotice( message );
											loadTemplates();
										} }
									/>
								);
							case 'preview':
								return (
									<PreviewScreen
										status={ status }
										refreshing={ refreshing }
										onRefresh={ doRefresh }
									/>
								);
							case 'transfer':
								return (
									<ImportExportScreen
										shows={ shows }
										onImported={ ( message ) => {
											setNotice( message );
											Promise.all( [
												loadBlocks(),
												loadShows(),
												loadTemplates(),
												loadTimeline(),
											] );
											getCategories().then(
												setCategories
											);
										} }
									/>
								);
							default:
								return (
									<>
										<ShowsBar
											shows={ shows }
											currentId={ show.id }
											busy={ busy }
											onSelect={ selectShow }
											onSetLive={ ( id, on ) => {
												const ids = lineupIds( shows );
												updateLineup(
													on
														? [ ...ids, id ]
														: ids.filter(
																( x ) =>
																	x !== id
															)
												);
											} }
											onCreate={ async ( title ) => {
												let newId = 0;
												await showAction( async () => {
													newId = (
														await createShow(
															title
														)
													).id;
												}, `Created “${ title }”.` );
												if ( newId ) {
													selectShow( newId );
												}
											} }
											onRename={ ( id, title ) =>
												showAction(
													() =>
														renameShow( id, title ),
													'Show renamed.',
													id
												)
											}
											onDuplicate={ async ( id ) => {
												let newId = 0;
												await showAction( async () => {
													newId = (
														await duplicateShow(
															id
														)
													).id;
												}, 'Show duplicated.' );
												if ( newId ) {
													selectShow( newId );
												}
											} }
											onDelete={ async ( id ) => {
												const next =
													shows.find(
														( s ) =>
															s.is_live &&
															s.id !== id
													) ??
													shows.find(
														( s ) => s.id !== id
													);
												await showAction(
													() => deleteShow( id ),
													'Show deleted.'
												);
												if ( next ) {
													selectShow( next.id );
												}
											} }
										/>
										<ShowScreen
											show={ show }
											blocks={ blocks }
											saving={ savingShow }
											onChange={ updateShowItems }
											onEditBlock={ ( id ) =>
												setEditing( { id } )
											}
											onPreviewBlock={ setPreviewing }
											onNewBlock={ () =>
												setEditing( { id: null } )
											}
										/>
									</>
								);
						}
					} }
				</TabPanel>
			) }

			{ previewing !== null && (
				<BlockPreview
					blockId={ previewing }
					title={
						blocks.find( ( b ) => b.id === previewing )?.title ?? ''
					}
					onClose={ () => setPreviewing( null ) }
				/>
			) }

			{ editing && (
				<BlockEditor
					blockId={ editing.id }
					categories={ categories }
					dataSources={ dataSources }
					templates={ templates }
					onClose={ () => setEditing( null ) }
					onSaved={ onSaved }
					onDeleted={ onDeleted }
				/>
			) }
		</div>
	);
}

// Previews of the follower counter update live too.
setFollowerFetcher( () =>
	api< { followers: number | null } >( {
		path: `${ NS }/player/instagram-followers`,
	} )
);

const el = document.getElementById( 'wots-signage-admin' );
if ( el ) {
	createRoot( el ).render( <App /> );
}
