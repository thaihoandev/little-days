import { useEffect, useRef, useState } from 'react';

/** Follow measured day headings, including cards that grow after photos load. */
export function TimelineTrail({ signature }: { signature: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState({
    width: 1,
    height: 1,
    path: '',
    nodes: [] as { x: number; y: number; end: number }[],
  });
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const box = parent.getBoundingClientRect(),
        width = box.width,
        height = box.height;
      const mobile = width < 620,
        center = mobile ? 17 : width / 2;
      const groups = Array.from(
        parent.querySelectorAll<HTMLElement>(':scope > .journal-day-group'),
      );
      const nodes = groups.map((group, index) => {
        const heading = group.querySelector('.journal-day-heading')!.getBoundingClientRect(),
          rect = group.getBoundingClientRect();
        return {
          x: center + (mobile ? 0 : index % 2 ? 12 : -12),
          y: heading.top - box.top + heading.height / 2,
          end: mobile
            ? rect.left - box.left
            : index % 2
              ? rect.left - box.left
              : rect.right - box.left,
        };
      });
      let path = `M ${center} 0`,
        previous = { x: center, y: 0 },
        wave = 0;
      for (const node of [...nodes, { x: center, y: height }]) {
        const start = previous;
        const segments = Math.max(1, Math.ceil((node.y - start.y) / 160));
        for (let step = 1; step < segments; step++) {
          const point = {
            x: center + (++wave % 2 ? 1 : -1) * (mobile ? 6 : 24),
            y: start.y + ((node.y - start.y) * step) / segments,
          };
          const middle = (previous.y + point.y) / 2;
          path += ` C ${previous.x} ${middle}, ${point.x} ${middle}, ${point.x} ${point.y}`;
          previous = point;
        }
        const middle = (previous.y + node.y) / 2;
        path += ` C ${previous.x} ${middle}, ${node.x} ${middle}, ${node.x} ${node.y}`;
        previous = node;
      }
      setDrawing({ width, height, path, nodes });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    for (const group of Array.from(parent.querySelectorAll(':scope > .journal-day-group')))
      observer.observe(group);
    measure();
    return () => observer.disconnect();
  }, [signature]);
  return (
    <svg
      ref={ref}
      className="timeline-trail"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      aria-hidden="true"
    >
      <path className="trail-underlay" d={drawing.path} />
      <path className="trail-thread" d={drawing.path} />
      {drawing.nodes.map((node, index) => (
        <g key={index}>
          <path className="trail-branch" d={`M ${node.x} ${node.y} H ${node.end}`} />
          <circle cx={node.x} cy={node.y} r="5" />
        </g>
      ))}
    </svg>
  );
}
