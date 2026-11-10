import { useEffect, useRef, type ReactNode } from 'react';

type DetailPanelProps = {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

// A secondary view inside the game viewport. Keeping it mounted retains form drafts.
export function DetailPanel({ id, title, open, onClose, children }: DetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <section id={id} className="detail-panel" hidden={!open} aria-labelledby={`${id}-title`}>
      <div className="detail-heading">
        <button type="button" onClick={onClose} aria-label={`Back from ${title}`}>‹ Back</button>
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{title}</h2>
      </div>
      <div className="detail-scroll" tabIndex={0} role="region" aria-label={`${title} details`}>
        {children}
      </div>
    </section>
  );
}
