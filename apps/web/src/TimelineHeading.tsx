import { useEffect, useState } from 'react';
import {
  defaultTimelineHeading,
  type TimelineHeading as Heading,
} from '../../../packages/domain/journal.js';
import { api } from './api.js';
export function TimelineHeading() {
  const [heading, setHeading] = useState<Heading>(defaultTimelineHeading);
  useEffect(() => {
    let active = true;
    api<Heading>('/timeline-heading')
      .then((value) => {
        if (active) setHeading(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="timeline-heading-edit">
      <h1>{heading.title}</h1>
      {heading.revision >= 0 && heading.description && <p>{heading.description}</p>}
    </div>
  );
}
