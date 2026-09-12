import type { Metadata, Viewport } from "next";
import { Archivo, DM_Mono } from "next/font/google";
import "./globals.css";

/**
 * One family across width and weight axes. Archivo's expanded widths read as
 * drafted rather than typeset, which suits a workshop for making objects.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/** Used in exactly one place: the room code, which people type and read aloud. */
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Studio — make one object, together",
  description:
    "A room where everyone shapes the same 3D object by describing it, then places it in the world through AR.",
};

export const viewport: Viewport = {
  themeColor: "#0e2030",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${dmMono.variable}`}>
      <body className="min-h-screen antialiased" style={{ fontFamily: "var(--font-archivo), system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
