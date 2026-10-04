<?php
namespace WOTS\Signage\DataSources;

defined( 'ABSPATH' ) || exit;

/**
 * Collects data sources. New sources register through the
 * `wots_signage_data_sources` filter (PRD §6), e.g.:
 *
 *     add_filter( 'wots_signage_data_sources', function ( $sources ) {
 *         $sources[] = new My_Staff_Picks();
 *         return $sources;
 *     } );
 */
final class Registry {

	/** @var array<string, Data_Source>|null */
	private static ?array $sources = null;

	/**
	 * @return array<string, Data_Source> Keyed by source key.
	 */
	public static function all(): array {
		if ( null === self::$sources ) {
			$list = apply_filters( 'wots_signage_data_sources', array( new Events(), new Community_Board(), new Featured_Readers() ) );

			self::$sources = array();
			foreach ( (array) $list as $source ) {
				if ( $source instanceof Data_Source ) {
					self::$sources[ $source->key() ] = $source;
				}
			}
		}
		return self::$sources;
	}

	public static function get( string $key ): ?Data_Source {
		return self::all()[ $key ] ?? null;
	}

	/**
	 * Summary for the admin UI.
	 */
	public static function describe(): array {
		$out = array();
		foreach ( self::all() as $source ) {
			$out[] = array(
				'key'        => $source->key(),
				'label'      => $source->label(),
				'available'  => $source->is_available(),
				// Every source can also show text typed into the template.
				'elements'   => array_merge( $source->elements(), array( Helpers::text_element() ) ),
				'taxonomies' => $source instanceof Filterable ? $source->taxonomies() : array(),
			);
		}
		return $out;
	}
}
