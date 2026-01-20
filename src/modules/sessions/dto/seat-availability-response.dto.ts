import { ApiProperty } from '@nestjs/swagger';
import { SeatResponseDto } from './seat-response.dto';

export class SeatAvailabilityResponseDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  movieTitle: string;

  @ApiProperty()
  room: string;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  ticketPrice: number;

  @ApiProperty()
  totalSeats: number;

  @ApiProperty()
  availableSeats: number;

  @ApiProperty()
  reservedSeats: number;

  @ApiProperty()
  soldSeats: number;

  @ApiProperty({ type: [SeatResponseDto] })
  seats: SeatResponseDto[];
}
