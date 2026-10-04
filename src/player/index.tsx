import { createRoot } from '@wordpress/element';
import { setFollowerFetcher } from '../shared/live';
import { config, fetchFollowers } from './api';
import { Player } from './Player';
import './style.css';

function App() {
	if ( ! config().authorized ) {
		return (
			<div className="wots-player-message">Display not authorized</div>
		);
	}
	return <Player />;
}

setFollowerFetcher( fetchFollowers );

const el = document.getElementById( 'wots-signage-player' );
if ( el ) {
	createRoot( el ).render( <App /> );
}
