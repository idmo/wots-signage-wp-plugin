<?php
namespace WOTS\Signage\DataSources;

defined( 'ABSPATH' ) || exit;

/**
 * A data source whose items can be narrowed by taxonomy terms (categories,
 * tags, …). Optional, so sources written against 0.2 keep working.
 *
 * The block stores its choice as { taxonomy: [ term_id, … ] }. Within one
 * taxonomy any chosen term matches; across taxonomies every one must match.
 */
interface Filterable {

	/**
	 * Taxonomies a block can filter this source by.
	 *
	 * @return array<string, string> Taxonomy slug => label.
	 */
	public function taxonomies(): array;
}
