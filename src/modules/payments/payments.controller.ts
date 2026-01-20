import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { PurchaseHistoryResponseDto } from './dto/purchase-history-response.dto';
import { SaleResponseDto } from './dto/sale-response.dto';
import { Sale } from './entities/sale.entity';
import { RateLimit, StrictRateLimit } from '@common/decorators/rate-limit.decorator';

@ApiTags('payments')
@Controller()
@RateLimit({ points: 60, duration: 60 }) // 60 req/min for payments
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/confirm')
  @StrictRateLimit() // Very strict: 10 req/min, block 5min if exceeded
  @ApiOperation({ summary: 'Confirm payment for a reservation' })
  @ApiResponse({
    status: 201,
    description: 'Payment confirmed',
    type: SaleResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid reservation or expired' })
  @ApiResponse({ status: 404, description: 'Reservation not found' })
  async confirmPayment(@Body() confirmPaymentDto: ConfirmPaymentDto): Promise<SaleResponseDto> {
    const sale = await this.paymentsService.confirmPayment(confirmPaymentDto);
    return this.toSaleResponseDto(sale);
  }

  @Get('users/:userId/purchases')
  @ApiOperation({ summary: 'Get purchase history for a user' })
  @ApiResponse({
    status: 200,
    description: 'Purchase history',
    type: PurchaseHistoryResponseDto,
  })
  async getPurchaseHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PurchaseHistoryResponseDto> {
    const sales = await this.paymentsService.getPurchaseHistory(userId);

    return {
      userId,
      purchases: sales.map((sale) => this.toSaleResponseDto(sale)),
      totalPurchases: sales.length,
    };
  }

  private toSaleResponseDto(sale: Sale): SaleResponseDto {
    return {
      id: sale.id,
      reservationId: sale.reservationId,
      userId: sale.userId,
      sessionId: sale.sessionId,
      movieTitle: sale.session?.movieTitle || '',
      room: sale.session?.room || '',
      sessionTime: sale.session?.startTime,
      totalAmount: Number(sale.totalAmount),
      paymentConfirmedAt: sale.paymentConfirmedAt,
      seats:
        sale.reservation?.seats?.map((seat) => ({
          id: seat.id,
          seatLabel: seat.seatLabel,
        })) || [],
    };
  }
}
