import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsController } from '@modules/reservations/reservations.controller';
import { ReservationsService } from '@modules/reservations/reservations.service';
import { CreateReservationDto } from '@modules/reservations/dto/create-reservation.dto';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Reservation, ReservationStatus } from '@modules/reservations/entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';
import { Session } from '@modules/sessions/entities/session.entity';
import { User } from '@modules/users/entities/user.entity';

describe('ReservationsController', () => {
  let controller: ReservationsController;
  let createMock: jest.Mock;
  let findByIdMock: jest.Mock;
  let cancelMock: jest.Mock;

  const mockReservation: Reservation = {
    id: 'reservation-123',
    userId: 'user-123',
    sessionId: 'session-123',
    status: ReservationStatus.PENDING,
    expiresAt: new Date(Date.now() + 30000),
    totalAmount: 50.0,
    createdAt: new Date(),
    updatedAt: new Date(),
    idempotencyKey: 'idem-key-123',
    seats: [
      {
        id: 'seat-1',
        seatLabel: 'A1',
        sessionId: 'session-123',
        status: SeatStatus.RESERVED,
        version: 1,
        createdAt: new Date(),
        session: null as unknown as Session,
      } as Seat,
      {
        id: 'seat-2',
        seatLabel: 'A2',
        sessionId: 'session-123',
        status: SeatStatus.RESERVED,
        version: 1,
        createdAt: new Date(),
        session: null as unknown as Session,
      } as Seat,
    ],
    session: null as unknown as Session,
    user: null as unknown as User,
  };

  beforeEach(async () => {
    createMock = jest.fn();
    findByIdMock = jest.fn();
    cancelMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [
        {
          provide: ReservationsService,
          useValue: {
            create: createMock,
            findById: findByIdMock,
            cancel: cancelMock,
          },
        },
      ],
    }).compile();

    controller = module.get<ReservationsController>(ReservationsController);
  });

  describe('create', () => {
    it('should create a reservation and return response dto', async () => {
      const createDto: CreateReservationDto = {
        userId: 'user-123',
        sessionId: 'session-123',
        seatIds: ['seat-1', 'seat-2'],
      };

      createMock.mockResolvedValue(mockReservation);

      const result = await controller.create(createDto, 'idem-key-123');

      expect(createMock).toHaveBeenCalledWith(createDto, 'idem-key-123');
      expect(result.id).toBe(mockReservation.id);
      expect(result.status).toBe(ReservationStatus.PENDING);
      expect(result.seats).toHaveLength(2);
    });

    it('should create reservation without idempotency key', async () => {
      const createDto: CreateReservationDto = {
        userId: 'user-123',
        sessionId: 'session-123',
        seatIds: ['seat-1'],
      };

      createMock.mockResolvedValue(mockReservation);

      await controller.create(createDto, undefined);

      expect(createMock).toHaveBeenCalledWith(createDto, undefined);
    });

    it('should throw ConflictException when seats not available', async () => {
      const createDto: CreateReservationDto = {
        userId: 'user-123',
        sessionId: 'session-123',
        seatIds: ['seat-1'],
      };

      createMock.mockRejectedValue(new ConflictException('Seats not available'));

      await expect(controller.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return a reservation by id', async () => {
      findByIdMock.mockResolvedValue(mockReservation);

      const result = await controller.findOne('reservation-123');

      expect(findByIdMock).toHaveBeenCalledWith('reservation-123');
      expect(result.id).toBe(mockReservation.id);
    });

    it('should throw NotFoundException when reservation not found', async () => {
      findByIdMock.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('should cancel a reservation', async () => {
      const cancelledReservation: Reservation = {
        ...mockReservation,
        status: ReservationStatus.CANCELLED,
      };

      cancelMock.mockResolvedValue(cancelledReservation);

      const result = await controller.cancel('reservation-123');

      expect(cancelMock).toHaveBeenCalledWith('reservation-123');
      expect(result.status).toBe(ReservationStatus.CANCELLED);
    });

    it('should throw BadRequestException when reservation cannot be cancelled', async () => {
      cancelMock.mockRejectedValue(new BadRequestException('Cannot cancel'));

      await expect(controller.cancel('reservation-123')).rejects.toThrow(BadRequestException);
    });
  });
});
