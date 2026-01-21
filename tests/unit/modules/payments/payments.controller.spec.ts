import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from '@modules/payments/payments.controller';
import { PaymentsService } from '@modules/payments/payments.service';
import { ConfirmPaymentDto } from '@modules/payments/dto/confirm-payment.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Sale } from '@modules/payments/entities/sale.entity';
import { Reservation, ReservationStatus } from '@modules/reservations/entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';
import { Session } from '@modules/sessions/entities/session.entity';
import { User } from '@modules/users/entities/user.entity';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let confirmPaymentMock: jest.Mock;
  let getPurchaseHistoryMock: jest.Mock;

  const mockSale: Sale = {
    id: 'sale-123',
    reservationId: 'reservation-123',
    userId: 'user-123',
    sessionId: 'session-123',
    totalAmount: 50.0,
    paymentConfirmedAt: new Date(),
    createdAt: new Date(),
    session: {
      id: 'session-123',
      movieTitle: 'Test Movie',
      room: 'Room 1',
      startTime: new Date(),
      ticketPrice: 25.0,
      createdAt: new Date(),
      seats: [],
      reservations: [],
    },
    reservation: {
      id: 'reservation-123',
      userId: 'user-123',
      sessionId: 'session-123',
      status: ReservationStatus.CONFIRMED,
      expiresAt: new Date(),
      totalAmount: 50.0,
      idempotencyKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: null as unknown as User,
      session: null as unknown as Session,
      seats: [
        {
          id: 'seat-1',
          seatLabel: 'A1',
          sessionId: 'session-123',
          status: SeatStatus.SOLD,
          version: 1,
          createdAt: new Date(),
          session: null as unknown as Session,
        } as Seat,
        {
          id: 'seat-2',
          seatLabel: 'A2',
          sessionId: 'session-123',
          status: SeatStatus.SOLD,
          version: 1,
          createdAt: new Date(),
          session: null as unknown as Session,
        } as Seat,
      ],
    } as Reservation,
    user: null as unknown as User,
  };

  beforeEach(async () => {
    confirmPaymentMock = jest.fn();
    getPurchaseHistoryMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: {
            confirmPayment: confirmPaymentMock,
            getPurchaseHistory: getPurchaseHistoryMock,
            findSaleWithDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('confirmPayment', () => {
    it('should confirm payment and return sale response dto', async () => {
      const confirmDto: ConfirmPaymentDto = {
        reservationId: 'reservation-123',
      };

      confirmPaymentMock.mockResolvedValue(mockSale);

      const result = await controller.confirmPayment(confirmDto);

      expect(confirmPaymentMock).toHaveBeenCalledWith(confirmDto);
      expect(result.id).toBe(mockSale.id);
      expect(result.reservationId).toBe(mockSale.reservationId);
      expect(result.movieTitle).toBe('Test Movie');
      expect(result.seats).toHaveLength(2);
    });

    it('should throw NotFoundException when reservation not found', async () => {
      const confirmDto: ConfirmPaymentDto = {
        reservationId: 'invalid-id',
      };

      confirmPaymentMock.mockRejectedValue(new NotFoundException());

      await expect(controller.confirmPayment(confirmDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when reservation expired', async () => {
      const confirmDto: ConfirmPaymentDto = {
        reservationId: 'expired-reservation',
      };

      confirmPaymentMock.mockRejectedValue(new BadRequestException('Reservation expired'));

      await expect(controller.confirmPayment(confirmDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPurchaseHistory', () => {
    it('should return purchase history for a user', async () => {
      getPurchaseHistoryMock.mockResolvedValue([mockSale]);

      const result = await controller.getPurchaseHistory('user-123');

      expect(getPurchaseHistoryMock).toHaveBeenCalledWith('user-123');
      expect(result.userId).toBe('user-123');
      expect(result.purchases).toHaveLength(1);
      expect(result.totalPurchases).toBe(1);
    });

    it('should return empty history when no purchases', async () => {
      getPurchaseHistoryMock.mockResolvedValue([]);

      const result = await controller.getPurchaseHistory('user-123');

      expect(result.purchases).toEqual([]);
      expect(result.totalPurchases).toBe(0);
    });
  });
});
