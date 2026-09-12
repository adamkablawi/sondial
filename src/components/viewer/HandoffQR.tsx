"use client";

import { useEffect, useState } from "react";

/**
 * AR happens on a phone. On a laptop the useful thing is not a disabled button
 * but a way to get the room into your hand, so we render the room URL as a
 * code to scan.
 */
export function HandoffQR({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QR) =>
      QR.toDataURL(url, {
        margin: 1,
        width: 320,
        // Light code on a transparent ground, to sit on the dark UI.
        color: { dark: "#e5e5e5", light: "#00000000" },
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
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`QR code linking to ${url}`} className="h-24 w-24" />
      <p className="max-w-[18ch] text-[11px] leading-snug text-neutral-400">
        Scan to open this room on your phone and place the object in AR.
      </p>
    </div>
  );
}
