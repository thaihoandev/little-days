import { useEffect, useState } from 'react';
export function UserAvatar({ name = 'Bạn', url }: { name?: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className="avatar user-avatar" aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => Array.from(word)[0])
          .join('')
          .toLocaleUpperCase('vi')
      )}
    </span>
  );
}
