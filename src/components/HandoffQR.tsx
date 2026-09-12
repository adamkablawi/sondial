"use client";

import { useEffect, useState } from "react";

/**
 * AR happens on a phone. On a laptop the useful thing is not a disabled button
 * but a way to get the room into your hand, so we show the room as a code to
 * scan.
 */
export function HandoffQR({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QR) =>
      QR.toDataURL(url, {
        margin: 1,
        width: 320,
        // Transparent ground so the code sits directly on the page.
        color: { dark: "#ede6da", light: "#00000000" },
      })
        .then((d) => !cancelled && setSrc(d))
        .catch(() => {}),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src) return null;

  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`QR code linking to ${url}`} className="h-20 w-20" />
      <p className="max-w-[15ch] text-[13px] leading-snug text-bone-faint">
        Scan to open this room on your phone and place the object in AR.
      </p>
    </div>
  );
}
