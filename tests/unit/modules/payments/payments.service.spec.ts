import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '@modules/payments/payments.service';
import { Sale } from '@modules/payments/entities/sale.entity';
import { EventPublisher } from '@modules/messaging/publishers/event.publisher';
import { ReservationStatus } from '@modules/reservations/entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockSaleRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEventPublisher = {
    publishPaymentConfirmed: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(Sale),
          useValue: mockSaleRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventPublisher,
          useValue: mockEventPublisher,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    jest.clearAllMocks();
  });

  describe('confirmPayment', () => {
    const confirmPaymentDto = {
      reservationId: 'reservation-uuid',
    };

    it('should confirm payment and create sale successfully', async () => {
      const reservation = {
        id: 'reservation-uuid',
        userId: 'user-uuid',
        sessionId: 'session-uuid',
        status: ReservationStatus.PENDING,
        totalAmount: 50.0,
        expiresAt: new Date(Date.now() + 30000), // Not expired
        seats: [
          { id: 'seat-1', seatLabel: 'A1' },
          { id: 'seat-2', seatLabel: 'A2' },
        ],
      };

      const sale = {
        id: 'sale-uuid',
        reservationId: 'reservation-uuid',
        userId: 'user-uuid',
        sessionId: 'session-uuid',
        totalAmount: 50.0,
      };

      const saleWithDetails = {
        ...sale,
        reservation: { seats: reservation.seats },
        session: { movieTitle: 'Avengers', room: 'Sala 1' },
      };

      // First call for lock, second for relations
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(reservation) // Lock query
        .mockResolvedValueOnce(reservation) // Relations query
        .mockResolvedValueOnce(null); // Check existing sale

      mockQueryRunner.manager.create.mockReturnValue(sale);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(reservation) // Save reservation status
        .mockResolvedValueOnce(sale); // Save sale

      mockSaleRepository.findOne.mockResolvedValue(saleWithDetails);

      const result = await service.confirmPayment(confirmPaymentDto);

      expect(result).toEqual(saleWithDetails);
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Seat,
        { id: In(['seat-1', 'seat-2']) },
        { status: SeatStatus.SOLD },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockEventPublisher.publishPaymentConfirmed).toHaveBeenCalled();
    });

    it('should return existing sale if payment already confirmed (idempotent)', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.CONFIRMED,
        seats: [],
      };

      const existingSale = {
        id: 'existing-sale-uuid',
        reservationId: 'reservation-uuid',
      };

      const saleWithDetails = {
        ...existingSale,
        reservation: { seats: [] },
        session: { movieTitle: 'Movie' },
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(reservation) // Lock
        .mockResolvedValueOnce(reservation) // Relations
        .mockResolvedValueOnce(existingSale); // Existing sale check

      mockSaleRepository.findOne.mockResolvedValue(saleWithDetails);

      const result = await service.confirmPayment(confirmPaymentDto);

      expect(result).toEqual(saleWithDetails);
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if reservation not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(NotFoundException);
      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(
        'Reservation with ID reservation-uuid not found',
      );
    });

    it('should throw BadRequestException if reservation is not pending', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.EXPIRED,
        seats: [],
        expiresAt: new Date(),
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(null); // No existing sale

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(
        /Reservation is expired, cannot confirm payment/,
      );
    });

    it('should throw BadRequestException if reservation has expired', async () => {
      const reservation = {
        id: 'reservation-uuid',
        status: ReservationStatus.PENDING,
        seats: [],
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(null);

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(
        /Reservation has expired/,
      );
    });

    it('should update reservation status to CONFIRMED', async () => {
      const reservation = {
        id: 'reservation-uuid',
        userId: 'user-uuid',
        sessionId: 'session-uuid',
        status: ReservationStatus.PENDING,
        totalAmount: 25.0,
        expiresAt: new Date(Date.now() + 30000),
        seats: [{ id: 'seat-1' }],
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(null);

      mockQueryRunner.manager.create.mockReturnValue({ id: 'sale-uuid' });
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'sale-uuid' });
      mockSaleRepository.findOne.mockResolvedValue({ id: 'sale-uuid' });

      await service.confirmPayment(confirmPaymentDto);

      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ReservationStatus.CONFIRMED,
        }),
      );
    });

    it('should rollback transaction on error', async () => {
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('getPurchaseHistory', () => {
    it('should return purchase history for a user', async () => {
      const sales = [
        {
          id: 'sale-1',
          userId: 'user-uuid',
          totalAmount: 50.0,
          createdAt: new Date('2026-01-20'),
          reservation: { seats: [{ id: 'seat-1' }] },
          session: { movieTitle: 'Movie 1' },
        },
        {
          id: 'sale-2',
          userId: 'user-uuid',
          totalAmount: 25.0,
          createdAt: new Date('2026-01-19'),
          reservation: { seats: [{ id: 'seat-2' }] },
          session: { movieTitle: 'Movie 2' },
        },
      ];

      mockSaleRepository.find.mockResolvedValue(sales);

      const result = await service.getPurchaseHistory('user-uuid');

      expect(result).toEqual(sales);
      expect(mockSaleRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
        relations: ['reservation', 'reservation.seats', 'session'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if user has no purchases', async () => {
      mockSaleRepository.find.mockResolvedValue([]);

      const result = await service.getPurchaseHistory('user-uuid');

      expect(result).toEqual([]);
    });
  });

  describe('findSaleWithDetails', () => {
    it('should return sale with all relations', async () => {
      const sale = {
        id: 'sale-uuid',
        reservation: {
          seats: [{ id: 'seat-1', seatLabel: 'A1' }],
        },
        session: {
          movieTitle: 'Avengers',
          room: 'Sala 1',
          startTime: new Date(),
        },
      };

      mockSaleRepository.findOne.mockResolvedValue(sale);

      const result = await service.findSaleWithDetails('sale-uuid');

      expect(result).toEqual(sale);
      expect(mockSaleRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'sale-uuid' },
        relations: ['reservation', 'reservation.seats', 'session'],
      });
    });

    it('should throw BadRequestException if sale not found', async () => {
      mockSaleRepository.findOne.mockResolvedValue(null);

      await expect(service.findSaleWithDetails('non-existent')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.findSaleWithDetails('non-existent')).rejects.toThrow(
        'Sale with ID non-existent not found',
      );
    });
  });
});
