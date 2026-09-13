import { useState } from 'react';

/** One or two sentences under a panel title, with an optional longer note behind "more". */
export function Explain({ short, long }: { short: string; long?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <p className="explain">
      {short}
      {long && (
        <>
          {' '}
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'less' : 'more'}
          </button>
          {open && <> {long}</>}
        </>
      )}
    </p>
  );
}
