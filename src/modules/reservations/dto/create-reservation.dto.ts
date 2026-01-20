import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User ID',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Session ID',
  })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    example: ['550e8400-e29b-41d4-a716-446655440002'],
    description: 'Array of seat IDs to reserve',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  seatIds: string[];
}
