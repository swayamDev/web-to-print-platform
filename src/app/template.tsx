/**
 * Re-mounted on every navigation (unlike the layout), so each new page settles in with a short
 * fade (PRD R-49). Off when the visitor prefers reduced motion (globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="motion-page flex flex-1 flex-col">{children}</div>;
}
