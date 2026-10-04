import type React from 'react';
import {
	BulletinCard,
	BulletinList,
	EventCard,
	EventsList,
	PostCard,
	PostsList,
	ReaderCard,
	ReadersList,
} from './Builtins';
import { FollowerCard, InstagramCard, InstagramList } from './Instagram';
import { PanelBox } from './Panel';
import { TemplateSlide } from './TemplateSlide';
import type { Fields, SlideItem } from './types';

const CARDS: Record< string, ( p: { fields: Fields } ) => React.JSX.Element > =
	{
		events: EventCard,
		posts: PostCard,
		community_board: BulletinCard,
		featured_readers: ReaderCard,
		instagram: InstagramCard,
		instagram_followers: FollowerCard,
	};

const LISTS: Record<
	string,
	( p: {
		label: string;
		items: Array< Fields & { id: string } >;
	} ) => React.JSX.Element
> = {
	events: EventsList,
	posts: PostsList,
	community_board: BulletinList,
	featured_readers: ReadersList,
	instagram: InstagramList,
	instagram_followers: ( { items } ) => (
		<FollowerCard fields={ items[ 0 ] ?? {} } />
	),
};

/**
 * The content of a dynamic block's slide (inside its panel). The panel's
 * background is drawn separately by the player so it stays still while
 * carousel items change.
 */
export function SlideContent( {
	item,
	elementTypes,
}: {
	item: SlideItem;
	elementTypes?: Record< string, string >;
} ) {
	if ( item.mode === 'list' ) {
		const List = LISTS[ item.source ];
		return (
			<PanelBox panel={ item.panel } wide contentKey={ item.key }>
				{ List ? (
					<List label={ item.label } items={ item.items } />
				) : (
					<p>{ item.block_name }</p>
				) }
			</PanelBox>
		);
	}

	if ( item.template ) {
		return (
			<PanelBox panel={ item.panel } wide contentKey={ item.key }>
				<TemplateSlide
					template={ item.template }
					fields={ item.fields }
					elementTypes={ elementTypes }
				/>
			</PanelBox>
		);
	}

	const Card = CARDS[ item.source ];
	return (
		<PanelBox panel={ item.panel } contentKey={ item.key }>
			{ Card ? (
				<Card fields={ item.fields } />
			) : (
				<h1 className="wots-b-title">{ item.block_name }</h1>
			) }
		</PanelBox>
	);
}
