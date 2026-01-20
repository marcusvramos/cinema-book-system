import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';

import { winstonConfig } from './infrastructure/logger/logger.config';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { redisConfig } from './config/redis.config';
import { reservationConfig } from './config/reservation.config';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UsersModule } from './modules/users/users.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { MessagingModule } from './modules/messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, redisConfig, rabbitmqConfig, reservationConfig],
    }),

    WinstonModule.forRoot(winstonConfig),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.user'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: true,
        migrations: ['dist/infrastructure/database/migrations/*.js'],
        logging: configService.get<string>('app.nodeEnv') === 'development',
      }),
      inject: [ConfigService],
    }),

    RedisModule,
    MessagingModule,

    UsersModule,
    SessionsModule,
    ReservationsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
