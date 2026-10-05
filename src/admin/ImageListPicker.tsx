import { Button } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { getMedia, type MediaInfo } from './api';

interface Props {
	/** Attachment IDs in play order. */
	value: number[];
	onChange: ( ids: number[] ) => void;
}

/**
 * Several images for one image block: each becomes its own slide. Pick
 * many at once from the media library (Shift/⌘-click), then reorder.
 */
export function ImageListPicker( { value, onChange }: Props ) {
	const [ info, setInfo ] = useState< Record< number, MediaInfo | null > >(
		{}
	);

	useEffect( () => {
		const missing = value.filter( ( id ) => ! ( id in info ) );
		if ( ! missing.length ) {
			return;
		}
		let live = true;
		Promise.all( missing.map( ( id ) => getMedia( id ) ) ).then(
			( found ) =>
				live &&
				setInfo( ( prev ) => ( {
					...prev,
					...Object.fromEntries(
						missing.map( ( id, i ) => [ id, found[ i ] ] )
					),
				} ) )
		);
		return () => {
			live = false;
		};
	}, [ value ] ); // eslint-disable-line react-hooks/exhaustive-deps

	const open = () => {
		const frame = window.wp.media( {
			title: 'Choose images',
			button: { text: 'Add to block' },
			library: { type: 'image' },
			multiple: 'add',
		} );
		frame.on( 'select', () => {
			const picked: number[] = [];
			const extra: Record< number, MediaInfo > = {};
			frame
				.state()
				.get( 'selection' )
				.each( ( model: any ) => {
					const a = model.toJSON();
					picked.push( a.id );
					extra[ a.id ] = {
						id: a.id,
						url: a.url,
						thumb: a.sizes?.medium?.url || a.url,
						mime: a.mime,
						title: a.title,
					};
				} );
			setInfo( ( prev ) => ( { ...prev, ...extra } ) );
			onChange( [
				...value,
				...picked.filter( ( id ) => ! value.includes( id ) ),
			] );
		} );
		frame.open();
	};

	const move = ( i: number, delta: number ) => {
		const next = [ ...value ];
		const [ id ] = next.splice( i, 1 );
		next.splice( i + delta, 0, id );
		onChange( next );
	};

	return (
		<div className="wots-image-list">
			{ value.length > 0 && (
				<ol className="wots-image-list__grid">
					{ value.map( ( id, i ) => {
						const m = info[ id ];
						return (
							<li key={ id }>
								{ m?.thumb ? (
									<img src={ m.thumb } alt={ m.title } />
								) : (
									<span className="wots-image-list__missing">
										{ m === null ? 'Missing' : '…' }
									</span>
								) }
								<span className="wots-image-list__num">
									{ i + 1 }
								</span>
								<span className="wots-image-list__tools">
									<Button
										size="small"
										icon="arrow-left-alt2"
										label="Move earlier"
										disabled={ i === 0 }
										onClick={ () => move( i, -1 ) }
									/>
									<Button
										size="small"
										icon="arrow-right-alt2"
										label="Move later"
										disabled={ i === value.length - 1 }
										onClick={ () => move( i, 1 ) }
									/>
									<Button
										size="small"
										icon="no-alt"
										label="Remove"
										onClick={ () =>
											onChange(
												value.filter(
													( x ) => x !== id
												)
											)
										}
									/>
								</span>
							</li>
						);
					} ) }
				</ol>
			) }
			<Button variant="secondary" onClick={ open }>
				{ value.length ? 'Add more images' : 'Choose images' }
			</Button>
			<span className="wots-subtle">
				{ value.length > 1
					? ` ${ value.length } images, one slide each.`
					: ' Pick one, or several for a slideshow.' }
			</span>
		</div>
	);
}
