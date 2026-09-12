import { NextResponse } from "next/server";
import { networkInterfaces } from "node:os";

/**
 * The server's LAN address.
 *
 * The AR handoff QR has to point somewhere a phone can reach. When the page is
 * opened on localhost the page origin is useless for that, so the code is built
 * from this instead. Returns null when there is no LAN address, and the caller
 * falls back to the page origin.
 */
export function GET() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return NextResponse.json({ address: address.address });
      }
    }
  }
  return NextResponse.json({ address: null });
}
