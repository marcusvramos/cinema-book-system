import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Reservation } from '@modules/reservations/entities/reservation.entity';

@Entity('sessions')
@Unique(['room', 'startTime'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movie_title', length: 255 })
  movieTitle: string;

  @Column({ length: 50 })
  room: string;

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'ticket_price', type: 'decimal', precision: 10, scale: 2 })
  ticketPrice: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Seat, (seat) => seat.session, { cascade: true })
  seats: Seat[];

  @OneToMany(() => Reservation, (reservation) => reservation.session)
  reservations: Reservation[];
}
