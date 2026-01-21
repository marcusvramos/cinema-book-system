import { ApiProperty } from '@nestjs/swagger';
import { SeatSummaryDto } from '@common/dto/seat-summary.dto';

export class SaleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  reservationId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  movieTitle: string;

  @ApiProperty()
  room: string;

  @ApiProperty()
  sessionTime: Date;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  paymentConfirmedAt: Date;

  @ApiProperty({ type: [SeatSummaryDto] })
  seats: SeatSummaryDto[];
}
