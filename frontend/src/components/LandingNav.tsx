"use client";

import PillNav from "./PillNav";

/// Landing navigation. PillNav ships wired to react-router; it was repointed at next/link
/// when it landed, which is the whole reason shadcn copies source into the repo rather than
/// installing a package.
///
/// Colours come from the mineral palette rather than the component's defaults, so it reads as
/// part of this product instead of a widget dropped onto it.
export function LandingNav() {
  return (
    <PillNav
      logo="/stone-mark.svg"
      logoAlt="Tamon"
      items={[
        {label: "How it works", href: "#how"},
        {label: "The stone", href: "#stone"},
        {label: "Open app", href: "/app"},
      ]}
      // The two text colours are for opposite states and are easy to invert. At rest the label
      // sits on a dark pill, so it must be light. On hover a baseColor-filled circle expands to
      // cover the pill, so the label must flip dark or it disappears into the fill.
      baseColor="#F2F0EC"
      pillColor="#0E1014"
      pillTextColor="#F2F0EC"
      hoveredPillTextColor="#0E1014"
      className="tamon-nav"
    />
  );
}
