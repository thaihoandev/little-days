import { useEffect, useState } from 'react';
export function UserAvatar({ name = 'Bạn', url }: { name?: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span
      className="avatar user-avatar"
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        aspectRatio: '1 / 1',
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            minWidth: 0,
            minHeight: 0,
            objectFit: 'cover',
            objectPosition: 'center',
            borderRadius: 'inherit',
            margin: 0,
            padding: 0,
          }}
          onError={() => setFailed(true)}
        />
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
