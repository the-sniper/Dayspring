const bands = [
  { min: 85, cls: "bg-emerald-100 text-emerald-800" }, // apply now
  { min: 70, cls: "bg-lime-100 text-lime-800" }, // strong
  { min: 50, cls: "bg-amber-100 text-amber-800" }, // stretch
  { min: 0, cls: "bg-stone-200 text-stone-600" }, // skip
];

export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-400">
        —
      </span>
    );
  }
  const band = bands.find((b) => score >= b.min) ?? bands[bands.length - 1];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${band.cls}`}
      title="Match score"
    >
      {score}
    </span>
  );
}
