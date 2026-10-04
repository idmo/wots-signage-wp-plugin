<?php
namespace WOTS\Signage\DataSources;

defined( 'ABSPATH' ) || exit;

/**
 * A data source whose block can hand-pick specific posts by ID. The block
 * stores them as post_ids; the source shows only those (still subject to
 * its own rules, e.g. events that have ended drop out). Optional, so
 * sources written against earlier versions keep working.
 */
interface Pickable {

	/** The post type the IDs refer to. */
	public function pick_post_type(): string;

	/** Plural noun for the editor, e.g. "events". */
	public function pick_label(): string;
}
