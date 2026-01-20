import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';
import { Session } from '@modules/sessions/entities/session.entity';
import { Reservation } from '@modules/reservations/entities/reservation.entity';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'reservation_id', unique: true })
  reservationId: string;

  @OneToOne(() => Reservation)
  @JoinColumn({ name: 'reservation_id' })
  reservation: Reservation;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.sales)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Session)
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({
    name: 'payment_confirmed_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  paymentConfirmedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
