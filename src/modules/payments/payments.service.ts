import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { EventPublisher } from '@modules/messaging/publishers/event.publisher';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { Reservation, ReservationStatus } from '@modules/reservations/entities/reservation.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async confirmPayment(dto: ConfirmPaymentDto): Promise<Sale> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservationLocked = await queryRunner.manager.findOne(Reservation, {
        where: { id: dto.reservationId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservationLocked) {
        throw new NotFoundException(`Reservation with ID ${dto.reservationId} not found`);
      }

      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id: dto.reservationId },
        relations: ['seats'],
      });

      if (!reservation) {
        throw new NotFoundException(`Reservation with ID ${dto.reservationId} not found`);
      }

      const existingSale = await queryRunner.manager.findOne(Sale, {
        where: { reservationId: dto.reservationId },
      });

      if (existingSale) {
        await queryRunner.commitTransaction();
        this.logger.log(`Payment already confirmed for reservation: ${dto.reservationId}`);
        return this.findSaleWithDetails(existingSale.id);
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new BadRequestException(
          `Reservation is ${reservation.status.toLowerCase()}, cannot confirm payment`,
        );
      }

      if (new Date() > reservation.expiresAt) {
        throw new BadRequestException('Reservation has expired');
      }

      reservation.status = ReservationStatus.CONFIRMED;
      await queryRunner.manager.save(reservation);

      const seatIds = reservation.seats.map((seat) => seat.id);
      if (seatIds.length > 0) {
        await queryRunner.manager.update(Seat, { id: In(seatIds) }, { status: SeatStatus.SOLD });
      }

      const sale = queryRunner.manager.create(Sale, {
        reservationId: reservation.id,
        userId: reservation.userId,
        sessionId: reservation.sessionId,
        totalAmount: reservation.totalAmount,
      });

      const savedSale = await queryRunner.manager.save(sale);

      await queryRunner.commitTransaction();

      this.logger.log(`Payment confirmed: Sale ${savedSale.id} for reservation ${reservation.id}`);

      await this.eventPublisher.publishPaymentConfirmed(savedSale, reservation);

      return this.findSaleWithDetails(savedSale.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findSaleWithDetails(saleId: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id: saleId },
      relations: ['reservation', 'reservation.seats', 'session'],
    });

    if (!sale) {
      throw new BadRequestException(`Sale with ID ${saleId} not found`);
    }

    return sale;
  }

  async getPurchaseHistory(userId: string): Promise<Sale[]> {
    return this.saleRepository.find({
      where: { userId },
      relations: ['reservation', 'reservation.seats', 'session'],
      order: { createdAt: 'DESC' },
    });
  }
}
