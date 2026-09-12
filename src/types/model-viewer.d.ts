import type * as React from "react";

/**
 * <model-viewer> is a custom element, so TSX needs to be told it exists.
 * Only the attributes we actually set are declared.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          "ios-src"?: string;
          poster?: string;
          alt?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-scale"?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "auto-rotate-delay"?: number;
          "rotation-per-second"?: string;
          "interaction-prompt"?: string;
          "shadow-intensity"?: string;
          "shadow-softness"?: string;
          "environment-image"?: string;
          "tone-mapping"?: string;
          exposure?: string;
          "camera-orbit"?: string;
          "field-of-view"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "disable-zoom"?: boolean;
          loading?: string;
          reveal?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
