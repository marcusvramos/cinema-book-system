import { ApiProperty } from '@nestjs/swagger';

export class ReservationSeatDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  seatLabel: string;
}
