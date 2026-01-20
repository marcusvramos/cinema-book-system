import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { Seat, SeatStatus } from './entities/seat.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { SeatAvailabilityResponseDto } from './dto/seat-availability-response.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
  ) {}

  async create(dto: CreateSessionDto): Promise<Session> {
    const existing = await this.sessionRepository.findOne({
      where: { room: dto.room, startTime: new Date(dto.startTime) },
    });

    if (existing) {
      throw new ConflictException('Session already exists for this room and time');
    }

    const session = this.sessionRepository.create({
      movieTitle: dto.movieTitle,
      room: dto.room,
      startTime: new Date(dto.startTime),
      ticketPrice: dto.ticketPrice,
    });

    const savedSession = await this.sessionRepository.save(session);

    const seats = this.generateSeats(savedSession.id, dto.totalSeats);
    await this.seatRepository.save(seats);

    this.logger.log(`Session created: ${savedSession.id} with ${dto.totalSeats} seats`);

    return this.findById(savedSession.id);
  }

  async findAll(): Promise<Session[]> {
    return this.sessionRepository.find({
      order: { startTime: 'ASC' },
    });
  }

  async findById(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['seats'],
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    return session;
  }

  async getAvailability(sessionId: string): Promise<SeatAvailabilityResponseDto> {
    const session = await this.findById(sessionId);

    const seats = await this.seatRepository.find({
      where: { sessionId },
      order: { seatLabel: 'ASC' },
    });

    const availableSeats = seats.filter((s) => s.status === SeatStatus.AVAILABLE).length;
    const reservedSeats = seats.filter((s) => s.status === SeatStatus.RESERVED).length;
    const soldSeats = seats.filter((s) => s.status === SeatStatus.SOLD).length;

    return {
      sessionId: session.id,
      movieTitle: session.movieTitle,
      room: session.room,
      startTime: session.startTime,
      ticketPrice: Number(session.ticketPrice),
      totalSeats: seats.length,
      availableSeats,
      reservedSeats,
      soldSeats,
      seats: seats.map((seat) => ({
        id: seat.id,
        seatLabel: seat.seatLabel,
        status: seat.status,
      })),
    };
  }

  private generateSeats(sessionId: string, totalSeats: number): Seat[] {
    const seats: Seat[] = [];
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const seatsPerRow = 8;

    let seatCount = 0;

    for (const row of rows) {
      for (let num = 1; num <= seatsPerRow && seatCount < totalSeats; num++) {
        const seat = this.seatRepository.create({
          sessionId,
          seatLabel: `${row}${num}`,
          status: SeatStatus.AVAILABLE,
        });
        seats.push(seat);
        seatCount++;
      }

      if (seatCount >= totalSeats) break;
    }

    return seats;
  }
}
