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
      baseColor="#F2F0EC"
      pillColor="#0E1014"
      pillTextColor="#0E1014"
      hoveredPillTextColor="#0E1014"
      className="tamon-nav"
    />
  );
}
