import { createRoot } from '@wordpress/element';
import { config } from './api';
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

const el = document.getElementById( 'wots-signage-player' );
if ( el ) {
	createRoot( el ).render( <App /> );
}
