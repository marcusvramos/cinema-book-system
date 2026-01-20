import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1705776000000 implements MigrationInterface {
  name = 'CreateInitialSchema1705776000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "seat_status_enum" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD')
    `);

    await queryRunner.query(`
      CREATE TYPE "reservation_status_enum" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "movie_title" varchar(255) NOT NULL,
        "room" varchar(50) NOT NULL,
        "start_time" TIMESTAMP NOT NULL,
        "ticket_price" decimal(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_sessions_room_start_time" UNIQUE ("room", "start_time"),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "seats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "seat_label" varchar(10) NOT NULL,
        "status" "seat_status_enum" NOT NULL DEFAULT 'AVAILABLE',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_seats_session_seat_label" UNIQUE ("session_id", "seat_label"),
        CONSTRAINT "PK_seats" PRIMARY KEY ("id"),
        CONSTRAINT "FK_seats_session" FOREIGN KEY ("session_id")
          REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "status" "reservation_status_enum" NOT NULL DEFAULT 'PENDING',
        "expires_at" TIMESTAMP NOT NULL,
        "idempotency_key" varchar(255),
        "total_amount" decimal(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_reservations_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservations_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_reservations_session" FOREIGN KEY ("session_id")
          REFERENCES "sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reservation_seats" (
        "reservation_id" uuid NOT NULL,
        "seat_id" uuid NOT NULL,
        CONSTRAINT "PK_reservation_seats" PRIMARY KEY ("reservation_id", "seat_id"),
        CONSTRAINT "FK_reservation_seats_reservation" FOREIGN KEY ("reservation_id")
          REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_reservation_seats_seat" FOREIGN KEY ("seat_id")
          REFERENCES "seats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reservation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "total_amount" decimal(10,2) NOT NULL,
        "payment_confirmed_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_sales_reservation" UNIQUE ("reservation_id"),
        CONSTRAINT "PK_sales" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_reservation" FOREIGN KEY ("reservation_id")
          REFERENCES "reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_sales_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_sales_session" FOREIGN KEY ("session_id")
          REFERENCES "sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seats_session_status" ON "seats" ("session_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_expires_at" ON "reservations" ("expires_at")
      WHERE "status" = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_user" ON "reservations" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sales_user" ON "sales" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservation_seats_seat" ON "reservation_seats" ("seat_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reservation_seats_seat"`);
    await queryRunner.query(`DROP INDEX "IDX_sales_user"`);
    await queryRunner.query(`DROP INDEX "IDX_reservations_user"`);
    await queryRunner.query(`DROP INDEX "IDX_reservations_expires_at"`);
    await queryRunner.query(`DROP INDEX "IDX_seats_session_status"`);

    await queryRunner.query(`DROP TABLE "sales"`);
    await queryRunner.query(`DROP TABLE "reservation_seats"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP TABLE "seats"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "reservation_status_enum"`);
    await queryRunner.query(`DROP TYPE "seat_status_enum"`);
  }
}
