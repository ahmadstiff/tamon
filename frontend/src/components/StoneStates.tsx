"use client";

/// The five states, explained.
///
/// The hero shows one live stone, which proves the artwork moves but says nothing about what
/// the states mean — a viewer meeting a stone labelled HANCUR has no way to know it is the end
/// of a sequence rather than a decoration.
///
/// These are the same fragments the contract renders, served as static files. The hero is the
/// live proof; this is the key to reading it.
const STATES = [
  {
    file: "stone-utuh",
    name: "UTUH",
    gloss: "intact",
    when: "Under 50% elapsed",
    v: "Nothing has happened yet. Plenty of time, which is exactly when nothing gets done.",
  },
  {
    file: "stone-lapuk",
    name: "LAPUK",
    gloss: "weathered",
    when: "50–80% elapsed",
    v: "The first hairline cracks. Past halfway, and the deadline stops being abstract.",
  },
  {
    file: "stone-retak",
    name: "RETAK",
    gloss: "cracked",
    when: "80%+ elapsed",
    v: "Fractures run deep. Still recoverable — this is the state meant to make you open your editor.",
  },
  {
    file: "stone-hancur",
    name: "HANCUR",
    gloss: "shattered",
    when: "Deadline missed",
    v: "The stake is forfeited and split among everyone whose own capital was still at risk.",
  },
  {
    file: "stone-kristal",
    name: "KRISTAL",
    gloss: "crystallised",
    when: "Target met",
    v: "Principal, staking yield, and a share of what others forfeited. The stone keeps the record.",
  },
];

export function StoneStates() {
  return (
    <section id="stone-states" className="border-crack border-t">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 flex flex-col gap-2">
          <span className="label">The stone</span>
          <h2 className="font-display text-2xl font-extrabold">Five states, one function.</h2>
          <p className="text-muted max-w-2xl text-sm leading-relaxed">
            The first three are decided by nothing but the clock — the contract compares
            <span className="data text-text"> block.timestamp</span> against your deadline and
            renders accordingly, with no transaction and no server involved. The last two are
            the outcome, written when the commitment settles or expires.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {STATES.map((s) => (
            <figure key={s.file} className="flex flex-col gap-3">
              {/* Static copies of the contract's own fragments — this is a key, not a claim
                  about live state. The hero above is the live one. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/stones/${s.file}.svg`}
                alt={`${s.name} — ${s.gloss}`}
                className="border-crack w-full border"
                loading="lazy"
              />
              <figcaption className="flex flex-col gap-1.5">
                <span className="data text-[11px] tracking-[0.14em]">
                  {s.name}
                  <span className="text-crack"> / </span>
                  <span className="text-muted">{s.gloss}</span>
                </span>
                <span className="data text-accent text-[10px] tracking-[0.12em] uppercase">
                  {s.when}
                </span>
                <p className="text-muted text-xs leading-relaxed">{s.v}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="text-muted border-crack mt-10 border-t pt-6 text-sm">
          A badge accumulates in the corner as you settle commitments — bronze, silver, then
          gold. It is drawn into the same SVG, so your record travels with every stone you own.
        </p>
      </div>
    </section>
  );
}
