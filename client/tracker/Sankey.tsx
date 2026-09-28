import type { AnalyticsReport } from '../../shared/analytics';
import type { ApplicationStage } from '../../shared/tracker';
import { applicationStages } from '../../shared/tracker';
import { colors, labels } from './model';

interface Node {
  key: string;
  stage: ApplicationStage;
  step: number;
  count: number;
  x: number;
  y: number;
  height: number;
  incoming: number;
  outgoing: number;
}
interface Edge {
  key: string;
  from: Node;
  to: Node;
  count: number;
}
export function Sankey({ paths }: { paths: AnalyticsReport['paths'] }) {
  if (!paths.length) return null;
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();
  for (const path of paths) {
    path.stages.forEach((stage, step) => {
      const key = step + ':' + stage;
      const node = nodes.get(key) || {
        key,
        stage,
        step,
        count: 0,
        x: 0,
        y: 0,
        height: 0,
        incoming: 0,
        outgoing: 0,
      };
      node.count += path.count;
      nodes.set(key, node);
      if (step > 0) {
        const from = nodes.get(step - 1 + ':' + path.stages[step - 1])!;
        const edgeKey = from.key + '>' + key;
        const edge = edges.get(edgeKey) || {
          key: edgeKey,
          from,
          to: node,
          count: 0,
        };
        edge.count += path.count;
        edges.set(edgeKey, edge);
      }
    });
  }
  const depth = Math.max(...[...nodes.values()].map((n) => n.step));
  const width = Math.max(680, (depth + 1) * 180);
  const total = paths.reduce((sum, p) => sum + p.count, 0);
  const scale = Math.min(28, 220 / total);
  const layers = Array.from({ length: depth + 1 }, (_, step) =>
    [...nodes.values()]
      .filter((n) => n.step === step)
      .sort(
        (a, b) =>
          applicationStages.indexOf(a.stage) -
          applicationStages.indexOf(b.stage),
      ),
  );
  const height = Math.max(
    250,
    ...layers.map(
      (layer) =>
        layer.reduce((sum, n) => sum + n.count * scale, 0) +
        Math.max(0, layer.length - 1) * 28 +
        80,
    ),
  );
  for (const layer of layers) {
    const extent =
      layer.reduce((sum, n) => sum + n.count * scale, 0) +
      (layer.length - 1) * 28;
    let y = (height - extent) / 2;
    for (const node of layer) {
      node.x = 30 + (node.step * (width - 160)) / Math.max(1, depth);
      node.y = y;
      node.height = node.count * scale;
      y += node.height + 28;
    }
  }
  const links = [...edges.values()]
    .sort(
      (a, b) =>
        a.from.step - b.from.step || a.from.y - b.from.y || a.to.y - b.to.y,
    )
    .map((edge) => {
      const thickness = edge.count * scale;
      const x1 = edge.from.x + 12,
        x2 = edge.to.x;
      const y1 = edge.from.y + edge.from.outgoing + thickness / 2,
        y2 = edge.to.y + edge.to.incoming + thickness / 2;
      edge.from.outgoing += thickness;
      edge.to.incoming += thickness;
      return {
        ...edge,
        thickness,
        d: `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`,
      };
    });
  return (
    <div className="sankey-scroll">
      <svg
        className="sankey"
        style={{ minWidth: width }}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Application journey Sankey: ribbon widths represent recorded application counts"
      >
        {layers.map((_, step) => (
          <text
            key={step}
            x={30 + (step * (width - 160)) / Math.max(1, depth)}
            y="19"
            className="sankey-step"
          >
            {step === 0 ? 'First Applied' : 'Next stage ' + step}
          </text>
        ))}
        {links.map((edge) => (
          <path
            key={edge.key}
            d={edge.d}
            stroke={colors[edge.to.stage]}
            strokeWidth={edge.thickness}
            fill="none"
            opacity=".3"
          >
            <title>
              {labels[edge.from.stage]} → {labels[edge.to.stage]}: {edge.count}{' '}
              applications at this step
            </title>
          </path>
        ))}
        {[...nodes.values()].map((node) => (
          <g key={node.key}>
            <rect
              x={node.x}
              y={node.y}
              width="12"
              height={node.height}
              fill={colors[node.stage]}
              rx="2"
            >
              <title>
                {labels[node.stage]}: {node.count} applications at step{' '}
                {node.step}
              </title>
            </rect>
            <text x={node.x + 18} y={node.y + node.height / 2 + 4}>
              {labels[node.stage]} · {node.count}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
