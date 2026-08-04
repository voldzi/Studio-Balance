export const STUDIO_TIME_ZONE = "Europe/Prague" as const;

export type PublicSessionStatus =
  | "bookable"
  | "full"
  | "closed"
  | "cancelled"
  | "completed";

export function publicSessionLabel(status: PublicSessionStatus): string {
  const labels: Record<PublicSessionStatus, string> = {
    bookable: "Lze rezervovat",
    cancelled: "Lekce zrušena",
    closed: "Rezervace uzavřena",
    completed: "Proběhlo",
    full: "Lekce je obsazena"
  };

  return labels[status];
}
