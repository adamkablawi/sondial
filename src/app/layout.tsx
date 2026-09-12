import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Itera — 3D Product Design Iteration",
  description: "Upload a product image, generate a 3D model, and iterate on the design with natural language.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
