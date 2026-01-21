import { SeatStatus } from '@modules/sessions/entities/seat.entity';

interface SeatStatusCount {
  available: number;
  reserved: number;
  sold: number;
  total: number;
}

interface SeatWithStatus {
  status: SeatStatus;
}

export function countSeatsByStatus(seats: SeatWithStatus[]): SeatStatusCount {
  const counts: SeatStatusCount = {
    available: 0,
    reserved: 0,
    sold: 0,
    total: seats.length,
  };

  for (const seat of seats) {
    switch (seat.status) {
      case SeatStatus.AVAILABLE:
        counts.available++;
        break;
      case SeatStatus.RESERVED:
        counts.reserved++;
        break;
      case SeatStatus.SOLD:
        counts.sold++;
        break;
    }
  }

  return counts;
}

export function getUnavailableSeatLabels(
  seats: Array<SeatWithStatus & { seatLabel: string }>,
): string[] {
  return seats.filter((s) => s.status !== SeatStatus.AVAILABLE).map((s) => s.seatLabel);
}
