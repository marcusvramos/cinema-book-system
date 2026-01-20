import { ApiProperty } from '@nestjs/swagger';
import { ReservationSeatDto } from './reservation-seat.dto';

export class ReservationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] })
  status: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [ReservationSeatDto] })
  seats: ReservationSeatDto[];
}
