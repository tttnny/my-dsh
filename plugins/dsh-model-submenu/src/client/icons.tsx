/**
 * The one glyph this plugin draws itself.
 *
 * The shared icon library carries no star, so the favorite mark is defined here:
 * a five-point star whose outline and fill use the same path, which keeps the
 * hover-only outline and the standing filled state identical in geometry.
 */

/**
 * Render the favorite star.
 * @param props.filled - draw the solid star; otherwise the outline.
 * @param props.size - square edge in pixels, matching the shared icon set's default.
 * @param props.className - extra class for colour and placement.
 * @returns the inline SVG.
 */
export function StarIcon({ filled, size = 14, className }: {
  readonly filled: boolean
  readonly size?: number | undefined
  readonly className?: string | undefined
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3.2l2.7 5.6 6.1.85-4.45 4.3 1.08 6.05L12 17.1l-5.43 2.9 1.08-6.05L3.2 9.65l6.1-.85z" />
    </svg>
  )
}
