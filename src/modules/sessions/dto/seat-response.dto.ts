import { ApiProperty } from '@nestjs/swagger';

export class SeatResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  seatLabel: string;

  @ApiProperty({ enum: ['AVAILABLE', 'RESERVED', 'SOLD'] })
  status: string;
}
