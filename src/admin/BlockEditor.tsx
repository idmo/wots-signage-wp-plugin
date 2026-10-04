import {
	Button,
	CheckboxControl,
	Modal,
	Notice,
	SelectControl,
	Spinner,
	TextControl,
	ToggleControl,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import {
	adminConfig,
	getBlock,
	saveBlock,
	trashBlock,
	type BlockRecord,
	type BlockType,
	type Category,
	type DataSourceInfo,
	type MediaInfo,
	type TemplateSummary,
} from './api';
import {
	DynamicSettings,
	MotionSettings,
	PanelSettings,
} from './DynamicFields';
import { BlockPreview } from './BlockPreview';
import { MediaPicker } from './MediaPicker';

interface Props {
	blockId: number | null; // null = new block
	categories: Category[];
	dataSources: DataSourceInfo[];
	templates: TemplateSummary[];
	onClose: () => void;
	onSaved: ( id: number, isNew: boolean, addToShow: boolean ) => void;
	onDeleted: ( id: number ) => void;
}

const EMPTY: BlockRecord = {
	title: '',
	status: 'publish',
	signage_category: [],
	meta: {
		_block_type: 'static_image',
		_start_date: '',
		_end_date: '',
		_duration_seconds: 0,
		_fit_mode: 'cover',
		_archived: false,
		_image_id: 0,
		_text_heavy: false,
		_video_id: 0,
		_data_source: 'events',
		_template_id: 0,
		_display_mode: 'carousel',
		_per_item_duration: 0,
		_max_items: 5,
		_list_label: '',
		_featured_month_year: '',
		_bg_image_id: 0,
		_panel_color: '#000000',
		_panel_opacity: 60,
		_title_color: '#ffffff',
		_body_color: '#ffffff',
		_meta_color: '#ffffff',
		_transition: '',
		_content_animation: '',
		_event_range: 'next',
		_range_days: 0,
		_range_start: '',
		_range_end: '',
		_term_filter: '',
		_post_ids: '',
	},
};

export function BlockEditor( {
	blockId,
	categories,
	dataSources,
	templates,
	onClose,
	onSaved,
	onDeleted,
}: Props ) {
	const isNew = blockId === null;
	const [ record, setRecord ] = useState< BlockRecord | null >(
		isNew ? EMPTY : null
	);
	const [ videoLength, setVideoLength ] = useState< number | null >( null );
	const [ addToShow, setAddToShow ] = useState( true );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ previewing, setPreviewing ] = useState( false );
	const { settings } = adminConfig();

	useEffect( () => {
		if ( blockId === null ) {
			return;
		}
		getBlock( blockId )
			.then( ( r ) =>
				setRecord( {
					id: r.id,
					title: r.title.raw,
					status: r.status,
					signage_category: r.signage_category ?? [],
					meta: { ...EMPTY.meta, ...r.meta },
				} )
			)
			.catch( ( e ) => setError( e.message ) );
	}, [ blockId ] );

	if ( ! record ) {
		return (
			<Modal title="Loading…" onRequestClose={ onClose }>
				{ error ? (
					<Notice status="error" isDismissible={ false }>
						{ error }
					</Notice>
				) : (
					<Spinner />
				) }
			</Modal>
		);
	}

	const meta = record.meta;
	const set = ( patch: Partial< BlockRecord > ) =>
		setRecord( { ...record, ...patch } );
	const setMeta = ( patch: Partial< BlockRecord[ 'meta' ] > ) =>
		setRecord( { ...record, meta: { ...meta, ...patch } } );
	const type = meta._block_type;

	const categoryDefault = categories
		.filter( ( c ) => record.signage_category.includes( c.id ) )
		.map( ( c ) => c.meta?._default_duration ?? 0 )
		.find( ( d ) => d > 0 );

	let defaultDuration = categoryDefault ?? settings.default_image_duration;
	if ( type === 'dynamic_template' ) {
		defaultDuration = categoryDefault ?? settings.default_item_duration;
	} else if ( type === 'video' ) {
		defaultDuration = videoLength ?? settings.default_video_duration;
	}

	const validate = (): string => {
		if ( ! record.title.trim() ) {
			return 'Give the block a name.';
		}
		if ( type === 'static_image' && ! meta._image_id ) {
			return 'Choose an image.';
		}
		if ( type === 'video' && ! meta._video_id ) {
			return 'Choose a video.';
		}
		if (
			meta._start_date &&
			meta._end_date &&
			meta._end_date < meta._start_date
		) {
			return 'The end date is before the start date.';
		}
		return '';
	};

	const save = async () => {
		const problem = validate();
		if ( problem ) {
			setError( problem );
			return;
		}
		setSaving( true );
		setError( '' );
		try {
			const saved = await saveBlock( {
				...record,
				title: record.title.trim(),
				status: 'publish',
			} );
			onSaved( saved.id, isNew, isNew && addToShow );
		} catch ( e ) {
			setError( ( e as Error ).message );
			setSaving( false );
		}
	};

	const remove = async () => {
		if ( ! record.id ) {
			return;
		}
		setSaving( true );
		try {
			await trashBlock( record.id );
			onDeleted( record.id );
		} catch ( e ) {
			setError( ( e as Error ).message );
			setSaving( false );
		}
	};

	return (
		<Modal
			title={ isNew ? 'New block' : `Edit “${ record.title }”` }
			onRequestClose={ onClose }
			className="wots-block-editor"
			size="medium"
		>
			{ error && (
				<Notice status="error" isDismissible={ false }>
					{ error }
				</Notice>
			) }

			<TextControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Name"
				help="Also available as the “Block Name” element, e.g. a heading on every slide."
				value={ record.title }
				onChange={ ( v ) => set( { title: v } ) }
			/>

			<SelectControl
				__next40pxDefaultSize
				__nextHasNoMarginBottom
				label="Type"
				value={ type }
				options={ [
					{ value: 'static_image', label: 'Image' },
					{ value: 'video', label: 'Video' },
					{
						value: 'dynamic_template',
						label: 'Dynamic (events, posts, community board, readers, Instagram)',
					},
				] }
				onChange={ ( v ) => setMeta( { _block_type: v as BlockType } ) }
			/>

			{ type === 'static_image' && (
				<MediaPicker
					kind="image"
					value={ meta._image_id }
					onChange={ ( id ) => setMeta( { _image_id: id } ) }
				/>
			) }

			{ type === 'video' && (
				<MediaPicker
					kind="video"
					value={ meta._video_id }
					onInfo={ ( info ) =>
						setVideoLength( info?.length ?? null )
					}
					onChange={ ( id, info: MediaInfo | null ) => {
						setMeta( { _video_id: id } );
						setVideoLength( info?.length ?? null );
					} }
				/>
			) }

			{ type === 'dynamic_template' && (
				<>
					<DynamicSettings
						meta={ meta }
						setMeta={ setMeta }
						dataSources={ dataSources }
						templates={ templates }
						itemDefault={ defaultDuration }
					/>
					<PanelSettings meta={ meta } setMeta={ setMeta } />
				</>
			) }

			{ type !== 'dynamic_template' && (
				<div className="wots-row">
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label="Fit"
						value={ meta._fit_mode }
						options={ [
							{
								value: 'cover',
								label: 'Fill the screen (crop edges)',
							},
							{
								value: 'contain',
								label: 'Fit inside (black bars)',
							},
							{
								value: 'contain-blur',
								label: 'Fit inside (blurred background)',
							},
						] }
						onChange={ ( v ) =>
							setMeta( {
								_fit_mode:
									v as BlockRecord[ 'meta' ][ '_fit_mode' ],
							} )
						}
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 1 }
						label={
							type === 'video'
								? 'Duration if length unknown'
								: 'Seconds on screen'
						}
						placeholder={ String( defaultDuration ) }
						help={
							type === 'video'
								? 'Videos play to the end.'
								: `Blank = ${ defaultDuration }s`
						}
						value={
							meta._duration_seconds
								? String( meta._duration_seconds )
								: ''
						}
						onChange={ ( v ) =>
							setMeta( {
								_duration_seconds: Math.max(
									0,
									parseInt( v, 10 ) || 0
								),
							} )
						}
					/>
				</div>
			) }

			<MotionSettings
				meta={ meta }
				setMeta={ setMeta }
				dynamic={ type === 'dynamic_template' }
			/>

			<div className="wots-row">
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					type="date"
					label="Start date"
					help="Blank = right away"
					value={ meta._start_date }
					onChange={ ( v ) => setMeta( { _start_date: v } ) }
				/>
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					type="date"
					label="End date"
					help="Blank = evergreen"
					value={ meta._end_date }
					onChange={ ( v ) => setMeta( { _end_date: v } ) }
				/>
			</div>

			{ categories.length > 0 && (
				<fieldset className="wots-fieldset">
					<legend>Category</legend>
					<div className="wots-checks">
						{ categories.map( ( c ) => (
							<CheckboxControl
								key={ c.id }
								__nextHasNoMarginBottom
								label={ c.name }
								checked={ record.signage_category.includes(
									c.id
								) }
								onChange={ ( on ) =>
									set( {
										signage_category: on
											? [
													...record.signage_category,
													c.id,
												]
											: record.signage_category.filter(
													( x ) => x !== c.id
												),
									} )
								}
							/>
						) ) }
					</div>
				</fieldset>
			) }

			{ ! isNew && (
				<ToggleControl
					__nextHasNoMarginBottom
					label="Archived"
					help="Archived blocks never play, whatever their dates."
					checked={ meta._archived }
					onChange={ ( v ) => setMeta( { _archived: v } ) }
				/>
			) }

			{ isNew && (
				<CheckboxControl
					__nextHasNoMarginBottom
					label="Add to the end of the show"
					checked={ addToShow }
					onChange={ setAddToShow }
				/>
			) }

			<div className="wots-modal-actions">
				{ ! isNew && (
					<Button
						variant="tertiary"
						isDestructive
						onClick={ remove }
						disabled={ saving }
					>
						Move to trash
					</Button>
				) }
				<span className="wots-spacer" />
				<Button
					variant="secondary"
					icon="visibility"
					onClick={ () => setPreviewing( true ) }
					disabled={ saving }
				>
					Preview
				</Button>
				<Button
					variant="tertiary"
					onClick={ onClose }
					disabled={ saving }
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={ save }
					isBusy={ saving }
					disabled={ saving }
				>
					{ isNew ? 'Create block' : 'Save' }
				</Button>
			</div>

			{ previewing && (
				<BlockPreview
					blockId={ record.id ?? 0 }
					record={ record }
					title={ record.title }
					onClose={ () => setPreviewing( false ) }
				/>
			) }
		</Modal>
	);
}
