<?php
namespace WOTS\Signage;

defined( 'ABSPATH' ) || exit;

/**
 * Plays one block in the admin before (or without) saving it.
 *
 * The block editor sends its current, unsaved values. They're laid over
 * the saved block for the length of one resolve, so the preview uses the
 * same resolver as the TV. A block that has never been saved gets a
 * stand-in ID that no real post uses.
 */
final class Block_Preview {

	private const VIRTUAL_ID = 2147480000;

	/** @var array<string, mixed> */
	private static array $meta = array();
	/** @var \WP_Term[]|null */
	private static ?array $terms = null;
	private static int $id       = 0;

	/**
	 * @param int        $block_id Saved block, or 0 for a new one.
	 * @param array|null $record   Unsaved values: title, meta, signage_category.
	 */
	public static function playlist( int $block_id, ?array $record ): array {
		$id = $block_id > 0 ? $block_id : self::VIRTUAL_ID;
		if ( null === $record ) {
			return Resolver::preview( $id );
		}

		self::$id    = $id;
		self::$meta  = self::sanitize_meta( (array) ( $record['meta'] ?? array() ) );
		self::$terms = null;
		if ( isset( $record['signage_category'] ) && is_array( $record['signage_category'] ) ) {
			self::$terms = array_values(
				array_filter(
					array_map(
						static fn( $term_id ) => get_term( (int) $term_id, PostTypes::CATEGORY ),
						$record['signage_category']
					),
					static fn( $term ) => $term instanceof \WP_Term
				)
			);
		}

		add_filter( 'get_post_metadata', array( self::class, 'filter_meta' ), 10, 3 );
		add_filter( 'get_the_terms', array( self::class, 'filter_terms' ), 10, 3 );
		try {
			$name = sanitize_text_field( (string) ( $record['title'] ?? '' ) );
			return Resolver::preview( $id, '' !== $name ? $name : 'New block' );
		} finally {
			remove_filter( 'get_post_metadata', array( self::class, 'filter_meta' ), 10 );
			remove_filter( 'get_the_terms', array( self::class, 'filter_terms' ), 10 );
			self::$meta  = array();
			self::$terms = null;
			self::$id    = 0;
		}
	}

	/**
	 * Registered block meta only, through each key's own sanitizer.
	 */
	private static function sanitize_meta( array $meta ): array {
		$registered = get_registered_meta_keys( 'post', PostTypes::BLOCK );
		$clean      = array();
		foreach ( $meta as $key => $value ) {
			if ( isset( $registered[ $key ] ) && ( is_scalar( $value ) || null === $value ) ) {
				$clean[ $key ] = sanitize_meta( $key, $value, 'post', PostTypes::BLOCK );
			}
		}
		return $clean;
	}

	/**
	 * @param mixed  $value     Short-circuit value (null = not handled).
	 * @param int    $object_id Post ID.
	 * @param string $meta_key  Key, '' for all.
	 */
	public static function filter_meta( $value, $object_id, $meta_key ) {
		if ( (int) $object_id !== self::$id || '' === $meta_key || ! array_key_exists( $meta_key, self::$meta ) ) {
			return $value;
		}
		$v = self::$meta[ $meta_key ];
		if ( is_bool( $v ) ) {
			$v = $v ? '1' : '';
		}
		// get_metadata() takes [0] of this when one value is asked for.
		return array( $v );
	}

	/**
	 * @param mixed  $terms    Terms WordPress found.
	 * @param int    $post_id  Post ID.
	 * @param string $taxonomy Taxonomy.
	 */
	public static function filter_terms( $terms, $post_id, $taxonomy ) {
		if ( (int) $post_id === self::$id && PostTypes::CATEGORY === $taxonomy && null !== self::$terms ) {
			return self::$terms ? self::$terms : false;
		}
		return $terms;
	}
}
