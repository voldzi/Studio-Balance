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

export type SessionAvailabilityInput = {
  activeBookings: number;
  bookingClosesAt: Date;
  bookingOpensAt: Date;
  capacity: number;
  endAt: Date;
  now: Date;
  startAt: Date;
  status: "scheduled" | "cancelled" | "completed";
};

export function sessionAvailability(input: SessionAvailabilityInput): PublicSessionStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "completed" || input.now >= input.endAt) return "completed";
  if (input.now < input.bookingOpensAt || input.now >= input.bookingClosesAt || input.now >= input.startAt) {
    return "closed";
  }
  return input.activeBookings >= input.capacity ? "full" : "bookable";
}

export type CancellationMode = "on_time" | "late" | "free_change_window";

export function cancellationMode(input: {
  cutoffAt: Date;
  freeCancellationUntil?: Date | null;
  now: Date;
}): CancellationMode {
  if (input.freeCancellationUntil && input.now <= input.freeCancellationUntil) return "free_change_window";
  return input.now <= input.cutoffAt ? "on_time" : "late";
}
