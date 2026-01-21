import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReservationsService } from '@modules/reservations/reservations.service';
import { Reservation, ReservationStatus } from '@modules/reservations/entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';
import { RedisLockService } from '@infrastructure/redis/redis-lock.service';
import { EventPublisher } from '@modules/messaging/publishers/event.publisher';

interface ReservationData {
  userId: string;
  sessionId: string;
  idempotencyKey?: string;
  totalAmount: number;
  status: ReservationStatus;
  expiresAt: Date;
  seats: Partial<Seat>[];
}

interface MockReservation {
  id: string;
  status: ReservationStatus;
  sessionId: string;
  seats: { id: string }[];
}

describe('ReservationsService', () => {
  let service: ReservationsService;

  const mockReservationRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRedisLockService = {
    withLock: jest.fn(),
  };

  const mockEventPublisher = {
    publishReservationCreated: jest.fn(),
    publishReservationExpired: jest.fn(),
    publishSeatReleased: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(30),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: getRepositoryToken(Reservation),
          useValue: mockReservationRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: RedisLockService,
          useValue: mockRedisLockService,
        },
        {
          provide: EventPublisher,
          useValue: mockEventPublisher,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const createReservationDto = {
      userId: 'user-uuid',
      sessionId: 'session-uuid',
      seatIds: ['seat-1', 'seat-2'],
    };

    it('should return existing reservation if idempotency key matches', async () => {
      const existingReservation = {
        id: 'reservation-uuid',
        idempotencyKey: 'idem-key-123',
        status: ReservationStatus.PENDING,
        seats: [],
      };

      mockReservationRepository.findOne.mockResolvedValue(existingReservation);

      const result = await service.create(createReservationDto, 'idem-key-123');

      expect(result).toEqual(existingReservation);
      expect(mockRedisLockService.withLock).not.toHaveBeenCalled();
    });

    it('should sort seat IDs before acquiring lock to prevent deadlocks', async () => {
      const dto = {
        userId: 'user-uuid',
        sessionId: 'session-uuid',
        seatIds: ['seat-3', 'seat-1', 'seat-2'],
      };

      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (resource: string, fn: () => Promise<unknown>) => {
          expect(resource).toBe('session:session-uuid:seats:seat-1,seat-2,seat-3');
          return fn();
        },
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      const seats = [
        { id: 'seat-1', status: SeatStatus.AVAILABLE, seatLabel: 'A1' },
        { id: 'seat-2', status: SeatStatus.AVAILABLE, seatLabel: 'A2' },
        { id: 'seat-3', status: SeatStatus.AVAILABLE, seatLabel: 'A3' },
      ];

      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue(seats);
      mockQueryRunner.manager.create.mockReturnValue({ id: 'new-reservation' });
      mockQueryRunner.manager.save.mockResolvedValue({
        id: 'new-reservation',
        seats,
      });

      await service.create(dto);

      expect(mockRedisLockService.withLock).toHaveBeenCalled();
    });

    it('should create reservation with correct TTL', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      const seats = [
        { id: 'seat-1', status: SeatStatus.AVAILABLE, seatLabel: 'A1' },
        { id: 'seat-2', status: SeatStatus.AVAILABLE, seatLabel: 'A2' },
      ];

      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue(seats);

      let createdReservation: ReservationData | null = null;
      mockQueryRunner.manager.create.mockImplementation(
        (_entity: unknown, data: ReservationData): ReservationData => {
          createdReservation = data;
          return data;
        },
      );
      mockQueryRunner.manager.save.mockResolvedValue({
        id: 'new-reservation',
        seats,
      });

      const beforeCreate = Date.now();
      await service.create(createReservationDto);
      const afterCreate = Date.now();

      const expiresAt = createdReservation!.expiresAt.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(beforeCreate + 30000);
      expect(expiresAt).toBeLessThanOrEqual(afterCreate + 30000 + 100);
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.create(createReservationDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if some seats not found', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 'seat-1', status: SeatStatus.AVAILABLE },
      ]);

      await expect(service.create(createReservationDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createReservationDto)).rejects.toThrow(
        'One or more seats not found',
      );
    });

    it('should throw ConflictException if seats are not available', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      const seats = [
        { id: 'seat-1', status: SeatStatus.RESERVED, seatLabel: 'A1' },
        { id: 'seat-2', status: SeatStatus.AVAILABLE, seatLabel: 'A2' },
      ];

      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue(seats);

      await expect(service.create(createReservationDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createReservationDto)).rejects.toThrow('Seats not available: A1');
    });

    it('should update seat status to RESERVED after creating reservation', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      const seats = [
        { id: 'seat-1', status: SeatStatus.AVAILABLE, seatLabel: 'A1' },
        { id: 'seat-2', status: SeatStatus.AVAILABLE, seatLabel: 'A2' },
      ];

      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue(seats);
      mockQueryRunner.manager.create.mockReturnValue({ id: 'new-reservation' });
      mockQueryRunner.manager.save.mockResolvedValue({
        id: 'new-reservation',
        seats,
      });

      await service.create(createReservationDto);

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Seat,
        { id: In(['seat-1', 'seat-2']) },
        { status: SeatStatus.RESERVED },
      );
    });

    it('should publish reservation created event', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );

      const session = { id: 'session-uuid', ticketPrice: 25 };
      const seats = [{ id: 'seat-1', status: SeatStatus.AVAILABLE }];
      const savedReservation = { id: 'new-reservation', seats };

      mockQueryRunner.manager.findOne.mockResolvedValue(session);
      mockQueryRunner.manager.find.mockResolvedValue(seats);
      mockQueryRunner.manager.create.mockReturnValue(savedReservation);
      mockQueryRunner.manager.save.mockResolvedValue(savedReservation);

      await service.create({ ...createReservationDto, seatIds: ['seat-1'] });

      expect(mockEventPublisher.publishReservationCreated).toHaveBeenCalledWith(savedReservation);
    });

    it('should rollback transaction on error', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockRedisLockService.withLock.mockImplementation(
        (_resource: string, fn: () => Promise<unknown>) => fn(),
      );
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createReservationDto)).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return reservation with relations', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.PENDING,
        seats: [{ id: 'seat-1' }],
        session: { id: 'session-uuid' },
      };

      mockReservationRepository.findOne.mockResolvedValue(reservation);

      const result = await service.findById('reservation-uuid');

      expect(result).toEqual(reservation);
      expect(mockReservationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'reservation-uuid' },
        relations: ['seats', 'session'],
      });
    });

    it('should throw NotFoundException when reservation not found', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending reservation', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.PENDING,
        sessionId: 'session-uuid',
        seats: [{ id: 'seat-1' }, { id: 'seat-2' }],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue(reservation);
      mockQueryRunner.manager.save.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.CANCELLED,
      });

      const result = await service.cancel('reservation-uuid');

      expect(result.status).toBe(ReservationStatus.CANCELLED);
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Seat,
        { id: In(['seat-1', 'seat-2']) },
        { status: SeatStatus.AVAILABLE },
      );
    });

    it('should throw BadRequestException if reservation is not pending', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.CONFIRMED,
        sessionId: 'session-uuid',
        seats: [],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue(reservation);

      await expect(service.cancel('reservation-uuid')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.cancel('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should publish seat released event after cancellation', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.PENDING,
        sessionId: 'session-uuid',
        seats: [{ id: 'seat-1' }],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue(reservation);
      mockQueryRunner.manager.save.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.CANCELLED,
      });

      await service.cancel('reservation-uuid');

      expect(mockEventPublisher.publishSeatReleased).toHaveBeenCalledWith('session-uuid', [
        'seat-1',
      ]);
    });
  });

  describe('expirePendingReservations', () => {
    it('should expire reservations past their expiration time', async () => {
      const expiredReservations = [
        {
          id: 'reservation-1',
          status: ReservationStatus.PENDING,
          sessionId: 'session-uuid',
          seats: [{ id: 'seat-1' }],
        },
        {
          id: 'reservation-2',
          status: ReservationStatus.PENDING,
          sessionId: 'session-uuid',
          seats: [{ id: 'seat-2' }],
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        setOnLocked: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(expiredReservations),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryRunner.manager.find.mockResolvedValue(expiredReservations);
      mockQueryRunner.manager.save.mockImplementation((reservation: MockReservation) =>
        Promise.resolve(reservation),
      );

      const result = await service.expirePendingReservations();

      expect(result).toBe(2);
      expect(mockQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(mockQueryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
      expect(mockEventPublisher.publishReservationExpired).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no reservations to expire', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        setOnLocked: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.expirePendingReservations();

      expect(result).toBe(0);
      expect(mockEventPublisher.publishReservationExpired).not.toHaveBeenCalled();
    });

    it('should release seats when expiring reservations', async () => {
      const expiredReservation = {
        id: 'reservation-1',
        status: ReservationStatus.PENDING,
        sessionId: 'session-uuid',
        seats: [{ id: 'seat-1' }, { id: 'seat-2' }],
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        setOnLocked: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([expiredReservation]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryRunner.manager.find.mockResolvedValue([expiredReservation]);
      mockQueryRunner.manager.save.mockResolvedValue(expiredReservation);

      await service.expirePendingReservations();

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Seat,
        { id: In(['seat-1', 'seat-2']) },
        { status: SeatStatus.AVAILABLE },
      );
    });
  });
});
