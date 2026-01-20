import { ApiProperty } from '@nestjs/swagger';

export class SaleSeatDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  seatLabel: string;
}
