import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';
import { Session } from '@modules/sessions/entities/session.entity';
import { RedisLockService } from '@infrastructure/redis/redis-lock.service';
import { EventPublisher } from '@modules/messaging/publishers/event.publisher';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { executeInTransaction } from '@infrastructure/database/transaction.util';
import { isUniqueViolation } from '@common/utils/error.util';
import { getUnavailableSeatLabels } from '@common/utils/seat.util';
import { EXPIRATION_BATCH_LIMIT } from '@modules/messaging/messaging.constants';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);
  private readonly reservationTtl: number;

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly dataSource: DataSource,
    private readonly redisLockService: RedisLockService,
    private readonly eventPublisher: EventPublisher,
    private readonly configService: ConfigService,
  ) {
    this.reservationTtl = this.configService.get<number>('reservation.ttlSeconds') || 30;
  }

  async create(dto: CreateReservationDto, idempotencyKey?: string): Promise<Reservation> {
    if (idempotencyKey) {
      const existing = await this.reservationRepository.findOne({
        where: { idempotencyKey },
        relations: ['seats'],
      });
      if (existing) {
        this.logger.log(`Returning existing reservation for idempotency key: ${idempotencyKey}`);
        return existing;
      }
    }

    const sortedSeatIds = [...dto.seatIds].sort();
    const lockResource = `session:${dto.sessionId}:seats:${sortedSeatIds.join(',')}`;

    return this.redisLockService.withLock(
      lockResource,
      async () => {
        return this.createReservationWithTransaction(dto, idempotencyKey, sortedSeatIds);
      },
      10000,
    );
  }

  private async createReservationWithTransaction(
    dto: CreateReservationDto,
    idempotencyKey: string | undefined,
    sortedSeatIds: string[],
  ): Promise<Reservation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const session = await queryRunner.manager.findOne(Session, {
        where: { id: dto.sessionId },
      });

      if (!session) {
        throw new NotFoundException(`Session with ID ${dto.sessionId} not found`);
      }

      const seats = await queryRunner.manager.find(Seat, {
        where: { id: In(sortedSeatIds), sessionId: dto.sessionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (seats.length !== sortedSeatIds.length) {
        throw new BadRequestException('One or more seats not found');
      }

      const unavailableLabels = getUnavailableSeatLabels(seats);
      if (unavailableLabels.length > 0) {
        throw new ConflictException(`Seats not available: ${unavailableLabels.join(', ')}`);
      }

      const totalAmount = seats.length * Number(session.ticketPrice);
      const expiresAt = new Date(Date.now() + this.reservationTtl * 1000);

      const reservation = queryRunner.manager.create(Reservation, {
        userId: dto.userId,
        sessionId: dto.sessionId,
        status: ReservationStatus.PENDING,
        expiresAt,
        idempotencyKey,
        totalAmount,
        seats,
      });

      const savedReservation = await queryRunner.manager.save(reservation);

      await queryRunner.manager.update(
        Seat,
        { id: In(sortedSeatIds) },
        { status: SeatStatus.RESERVED },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Reservation created: ${savedReservation.id} for seats: ${sortedSeatIds.join(', ')}`,
      );

      await this.eventPublisher.publishReservationCreated(savedReservation);

      return savedReservation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.reservationRepository.findOne({
          where: { idempotencyKey },
          relations: ['seats'],
        });
        if (existing) {
          this.logger.log(`Returning existing reservation for idempotency key: ${idempotencyKey}`);
          return existing;
        }
      }
      const err = error as Error;
      this.logger.error(`Failed to create reservation: ${err.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findById(id: string): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['seats', 'session'],
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    return reservation;
  }

  async cancel(id: string): Promise<Reservation> {
    const reservation = await this.findById(id);

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException('Only pending reservations can be cancelled');
    }

    return this.releaseReservation(reservation, ReservationStatus.CANCELLED);
  }

  async expirePendingReservations(limit = EXPIRATION_BATCH_LIMIT): Promise<number> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();

      const reservations = await queryRunner.manager
        .createQueryBuilder(Reservation, 'reservation')
        .where('reservation.status = :status', {
          status: ReservationStatus.PENDING,
        })
        .andWhere('reservation.expires_at < :now', { now })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .limit(limit)
        .getMany();

      if (reservations.length === 0) {
        await queryRunner.commitTransaction();
        return 0;
      }

      const reservationIds = reservations.map((r) => r.id);
      const reservationsWithSeats = await queryRunner.manager.find(Reservation, {
        where: { id: In(reservationIds) },
        relations: ['seats'],
      });

      const seatsMap = new Map(reservationsWithSeats.map((r) => [r.id, r.seats]));
      for (const reservation of reservations) {
        reservation.seats = seatsMap.get(reservation.id) || [];
      }

      for (const reservation of reservations) {
        reservation.status = ReservationStatus.EXPIRED;
        await queryRunner.manager.save(reservation);

        const seatIds = reservation.seats?.map((s) => s.id) || [];
        if (seatIds.length > 0) {
          await queryRunner.manager.update(
            Seat,
            { id: In(seatIds) },
            { status: SeatStatus.AVAILABLE },
          );
        }
      }

      await queryRunner.commitTransaction();

      for (const reservation of reservations) {
        await this.eventPublisher.publishReservationExpired(reservation);
        await this.eventPublisher.publishSeatReleased(
          reservation.sessionId,
          reservation.seats?.map((seat) => seat.id) || [],
        );
      }

      return reservations.length;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const err = error as Error;
      this.logger.error(`Failed to expire reservations: ${err.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async releaseReservation(
    reservation: Reservation,
    status: ReservationStatus,
  ): Promise<Reservation> {
    const seatIds = reservation.seats.map((s) => s.id);

    await executeInTransaction(this.dataSource, async (manager: EntityManager) => {
      reservation.status = status;
      await manager.save(reservation);

      if (seatIds.length > 0) {
        await manager.update(Seat, { id: In(seatIds) }, { status: SeatStatus.AVAILABLE });
      }
    });

    this.logger.log(`Reservation ${status.toLowerCase()}: ${reservation.id}`);
    await this.eventPublisher.publishSeatReleased(reservation.sessionId, seatIds);

    return reservation;
  }
}
