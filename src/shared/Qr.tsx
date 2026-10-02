import { useMemo } from '@wordpress/element';
import qrcode from 'qrcode-generator';

/**
 * Scalable SVG QR code. Generated client-side so it works offline and in the
 * builder preview with no server round trip.
 */
export function Qr( {
	value,
	className,
}: {
	value: string;
	className?: string;
} ) {
	const svg = useMemo( () => {
		if ( ! value ) {
			return '';
		}
		const qr = qrcode( 0, 'M' );
		qr.addData( value );
		qr.make();
		return qr.createSvgTag( { cellSize: 4, margin: 0, scalable: true } );
	}, [ value ] );

	if ( ! svg ) {
		return null;
	}
	// SVG generated locally from a URL string.
	return (
		<div
			className={ className }
			dangerouslySetInnerHTML={ { __html: svg } }
		/>
	);
}
