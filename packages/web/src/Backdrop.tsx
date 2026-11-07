import { Box } from '@wso2/oxygen-ui';
import { usePattern } from './appearance';

function point(x: number, y: number): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function wave(radius: number, depth: number, lobes: number, phase: number): string {
  const steps = lobes * 12;
  const points = Array.from({ length: steps }, (_, step) => {
    const angle = (step / steps) * Math.PI * 2;
    const reach = radius + depth * Math.sin(lobes * angle + phase);
    return point(reach * Math.cos(angle), reach * Math.sin(angle));
  });
  return `M${points.join('L')}Z`;
}

function rosette(outer: number, ratio: number, reach: number, turns: number): string {
  const inner = outer * ratio;
  const speed = (outer - inner) / inner;
  const steps = turns * 540;
  const points = Array.from({ length: steps + 1 }, (_, step) => {
    const angle = (step / 540) * Math.PI * 2;
    return point(
      (outer - inner) * Math.cos(angle) + reach * Math.cos(speed * angle),
      (outer - inner) * Math.sin(angle) - reach * Math.sin(speed * angle),
    );
  });
  return `M${points.join('L')}`;
}

const STRANDS = 6;
const LOBES = 48;

const ENGRAVING = [
  ...[0, Math.PI].flatMap((start) =>
    Array.from({ length: STRANDS }, (_, strand) => ({
      id: `braid-${start}-${strand}`,
      path: wave(380, 18, LOBES, start + (strand / STRANDS) * ((Math.PI * 2) / LOBES)),
    })),
  ),
  { id: 'rosette', path: rosette(260, 5 / 36, 90, 5) },
];

export function Backdrop() {
  const [pattern] = usePattern();
  if (pattern === 'off') return null;
  return (
    <Box
      aria-hidden
      sx={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <Box
        component="svg"
        viewBox="-420 -420 840 840"
        sx={{
          position: 'absolute',
          width: 900,
          height: 900,
          top: -280,
          right: -260,
          color: 'primary.main',
          opacity: 0.22,
          '[data-color-scheme="dark"] &': { opacity: 0.3 },
        }}
      >
        <g fill="none" stroke="currentColor" strokeWidth={0.6}>
          {ENGRAVING.map((line) => (
            <path key={line.id} d={line.path} />
          ))}
        </g>
      </Box>
    </Box>
  );
}
