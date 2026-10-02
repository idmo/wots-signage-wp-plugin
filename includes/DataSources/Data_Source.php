<?php
namespace WOTS\Signage\DataSources;

defined( 'ABSPATH' ) || exit;

/**
 * A provider of items for dynamic blocks (PRD §6). Providers query WordPress
 * directly; nothing is synced or polled.
 */
interface Data_Source {

	/** Machine key stored in block/template meta, e.g. 'events'. */
	public function key(): string;

	/** Human label for the admin. */
	public function label(): string;

	/**
	 * Element palette for the Template Builder (PRD §7).
	 *
	 * @return array<int, array{key: string, label: string, type: string}>
	 *         type is one of image | text | html | qr.
	 */
	public function elements(): array;

	/**
	 * Normalized items for the player.
	 *
	 * @param array $block_config Block settings (max_items, featured_month_year, …).
	 * @return array<int, array{id: string, fields: array, ends_at?: int|null}>
	 *         fields are keyed by element key. ends_at (unix time) tells the
	 *         resolver when this item will drop out on its own.
	 */
	public function items( array $block_config ): array;

	/** Whether the plugin this source reads from is installed and active. */
	public function is_available(): bool;
}
