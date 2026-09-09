import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Icône iOS : le symbole « E » en blanc sur un carré violet plein.
 * Un fond opaque est requis, iOS ne gère pas la transparence sur ces icônes.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#6C5CE7",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 96,
              height: 24,
              borderRadius: 12,
              background: "#FFFFFF",
            }}
          />
        ))}
      </div>
    ),
    { ...size },
  );
}
