export function DifficultyStars({ value }: { value: number }) {
  const label = `Náročnost ${value} z 5`;
  return (
    <span aria-label={label} className="difficulty-stars" title={label}>
      <span aria-hidden="true">{"★".repeat(value)}{"☆".repeat(5 - value)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
