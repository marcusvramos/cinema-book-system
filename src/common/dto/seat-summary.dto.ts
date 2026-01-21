import { ApiProperty } from '@nestjs/swagger';

export class SeatSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  seatLabel: string;
}
