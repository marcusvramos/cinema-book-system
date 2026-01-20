import { ApiProperty } from '@nestjs/swagger';
import { SaleResponseDto } from './sale-response.dto';

export class PurchaseHistoryResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ type: [SaleResponseDto] })
  purchases: SaleResponseDto[];

  @ApiProperty()
  totalPurchases: number;
}
