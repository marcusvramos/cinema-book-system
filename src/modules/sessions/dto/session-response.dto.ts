import { ApiProperty } from '@nestjs/swagger';
import { SeatResponseDto } from './seat-response.dto';

export class SessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  movieTitle: string;

  @ApiProperty()
  room: string;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  ticketPrice: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [SeatResponseDto], required: false })
  seats?: SeatResponseDto[];
}
