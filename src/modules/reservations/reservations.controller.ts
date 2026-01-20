import { Controller, Get, Post, Delete, Body, Param, Headers, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { Reservation } from './entities/reservation.entity';
import { RateLimit, WriteRateLimit } from '@common/decorators/rate-limit.decorator';

@ApiTags('reservations')
@Controller('reservations')
@RateLimit({ points: 60, duration: 60 }) // 60 req/min for reservations
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @WriteRateLimit() // Stricter: 30 req/min for writes
  @ApiOperation({ summary: 'Create a new reservation (30 seconds TTL)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key to prevent duplicate reservations',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Reservation created',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Seats not available' })
  @ApiResponse({ status: 404, description: 'Session or seats not found' })
  async create(
    @Body() createReservationDto: CreateReservationDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<ReservationResponseDto> {
    const reservation = await this.reservationsService.create(createReservationDto, idempotencyKey);

    return this.toResponseDto(reservation);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reservation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Reservation details',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Reservation not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReservationResponseDto> {
    const reservation = await this.reservationsService.findById(id);
    return this.toResponseDto(reservation);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a reservation' })
  @ApiResponse({
    status: 200,
    description: 'Reservation cancelled',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Reservation cannot be cancelled' })
  @ApiResponse({ status: 404, description: 'Reservation not found' })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<ReservationResponseDto> {
    const reservation = await this.reservationsService.cancel(id);
    return this.toResponseDto(reservation);
  }

  private toResponseDto(reservation: Reservation): ReservationResponseDto {
    return {
      id: reservation.id,
      userId: reservation.userId,
      sessionId: reservation.sessionId,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      totalAmount: Number(reservation.totalAmount),
      createdAt: reservation.createdAt,
      seats:
        reservation.seats?.map((seat) => ({
          id: seat.id,
          seatLabel: seat.seatLabel,
        })) || [],
    };
  }
}
