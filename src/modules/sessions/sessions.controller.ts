import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SeatAvailabilityResponseDto } from './dto/seat-availability-response.dto';
import { SessionResponseDto } from './dto/session-response.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cinema session' })
  @ApiResponse({
    status: 201,
    description: 'Session created successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Session already exists for this room and time',
  })
  async create(@Body() createSessionDto: CreateSessionDto): Promise<SessionResponseDto> {
    const session = await this.sessionsService.create(createSessionDto);
    return {
      id: session.id,
      movieTitle: session.movieTitle,
      room: session.room,
      startTime: session.startTime,
      ticketPrice: Number(session.ticketPrice),
      createdAt: session.createdAt,
      seats: session.seats?.map((seat) => ({
        id: seat.id,
        seatLabel: seat.seatLabel,
        status: seat.status,
      })),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all sessions' })
  @ApiResponse({
    status: 200,
    description: 'List of sessions',
    type: [SessionResponseDto],
  })
  async findAll(): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionsService.findAll();
    return sessions.map((session) => ({
      id: session.id,
      movieTitle: session.movieTitle,
      room: session.room,
      startTime: session.startTime,
      ticketPrice: Number(session.ticketPrice),
      createdAt: session.createdAt,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  @ApiResponse({
    status: 200,
    description: 'Session details',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SessionResponseDto> {
    const session = await this.sessionsService.findById(id);
    return {
      id: session.id,
      movieTitle: session.movieTitle,
      room: session.room,
      startTime: session.startTime,
      ticketPrice: Number(session.ticketPrice),
      createdAt: session.createdAt,
      seats: session.seats?.map((seat) => ({
        id: seat.id,
        seatLabel: seat.seatLabel,
        status: seat.status,
      })),
    };
  }

  @Get(':id/seats')
  @ApiOperation({ summary: 'Get seat availability for a session (real-time)' })
  @ApiResponse({
    status: 200,
    description: 'Seat availability',
    type: SeatAvailabilityResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getAvailability(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SeatAvailabilityResponseDto> {
    return this.sessionsService.getAvailability(id);
  }
}
