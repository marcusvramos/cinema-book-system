import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsDateString, Min, Max, IsPositive } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ example: 'Avengers: Endgame', description: 'Movie title' })
  @IsString()
  movieTitle: string;

  @ApiProperty({ example: 'Sala 1', description: 'Room name' })
  @IsString()
  room: string;

  @ApiProperty({
    example: '2025-01-20T19:00:00Z',
    description: 'Session start time',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: 25.0, description: 'Ticket price' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  ticketPrice: number;

  @ApiProperty({ example: 16, description: 'Total number of seats (min 16)' })
  @IsNumber()
  @Min(16)
  @Max(200)
  totalSeats: number;
}
