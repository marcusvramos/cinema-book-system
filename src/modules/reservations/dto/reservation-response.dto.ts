import { ApiProperty } from '@nestjs/swagger';
import { SeatSummaryDto } from '@common/dto/seat-summary.dto';

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

  @ApiProperty({ type: [SeatSummaryDto] })
  seats: SeatSummaryDto[];
}
