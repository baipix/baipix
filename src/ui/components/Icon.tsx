import { ICONS, LOGO, type IconName } from '../icons';

interface IconProps {
  name: IconName;
  /** Rendered size in CSS px. */
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  if (name === 'logo') {
    // `size` is the logo height; multiples of 8 keep every square on whole pixels.
    return (
      <svg
        className="icon"
        viewBox={`0 0 ${LOGO.width} ${LOGO.height}`}
        width={(size * LOGO.width) / LOGO.height}
        height={size}
        shapeRendering="crispEdges"
        // The pixel hops above the logo's box on hover.
        overflow="visible"
        aria-hidden="true"
      >
        <path fill="currentColor" d={LOGO.d} />
        <path className="logo-pixel" fill="currentColor" d={LOGO.pixel} />
      </svg>
    );
  }
  // Line icons: a 1.75 stroke in their 24 px box, about 1.2 px at the usual 16 px.
  const Glyph = ICONS[name];
  return <Glyph className="icon" width={size} height={size} strokeWidth={1.75} aria-hidden="true" />;
}
