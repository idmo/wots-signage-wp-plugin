import { Button, ExternalLink } from '@wordpress/components';
import { adminConfig, type AdminStatus } from './api';
import { playerHealth } from './common';

interface Props {
	status: AdminStatus | null;
	refreshing: boolean;
	onRefresh: () => void;
}

/** Live player preview + shop player health (PRD §8.5, §9.5). */
export function PreviewScreen( { status, refreshing, onRefresh }: Props ) {
	const { previewUrl, playerUrl, settingsUrl } = adminConfig();
	const hb = status?.heartbeat ?? null;
	const health = playerHealth(
		hb,
		status?.now ?? Math.floor( Date.now() / 1000 )
	);
	const inSync = hb && status && hb.version === status.version;

	return (
		<div className="wots-preview">
			<div className="wots-preview__frame">
				<iframe title="Signage preview" src={ previewUrl } />
			</div>

			<div className="wots-preview__side">
				<h2>Shop player</h2>
				<p className={ `wots-health wots-health--${ health.health }` }>
					{ health.text }
				</p>
				{ hb && (
					<dl className="wots-dl">
						<dt>Showing</dt>
						<dd>{ hb.item_name || '—' }</dd>
						<dt>Content</dt>
						<dd>
							{ inSync
								? 'Up to date'
								: 'Will update within one check interval' }
						</dd>
						<dt>Screen</dt>
						<dd>{ hb.screen || '—' }</dd>
						{ hb.last_error && (
							<>
								<dt>Last error</dt>
								<dd className="wots-error-text">
									{ hb.last_error }
								</dd>
							</>
						) }
					</dl>
				) }

				<Button
					variant="primary"
					onClick={ onRefresh }
					isBusy={ refreshing }
					disabled={ refreshing }
				>
					Refresh now
				</Button>
				<p className="wots-hint">
					Saved changes reach the TV automatically within{ ' ' }
					{ adminConfig().settings.poll_interval } seconds. Refresh
					now makes the player re-check on its next poll, even if
					nothing was edited.
				</p>

				<h2>Kiosk URL</h2>
				<p className="wots-hint">
					Open this on the shop Mac. Keep it private: anyone with the
					link can view the show. Rotate the key in{ ' ' }
					<a href={ settingsUrl }>Settings</a>.
				</p>
				<ExternalLink href={ playerUrl }>
					Open player in a new tab
				</ExternalLink>
			</div>
		</div>
	);
}
