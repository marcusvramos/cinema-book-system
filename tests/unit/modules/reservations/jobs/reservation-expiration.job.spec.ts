import { Test, TestingModule } from '@nestjs/testing';
import { ReservationExpirationJob } from '@modules/reservations/jobs/reservation-expiration.job';
import { ReservationsService } from '@modules/reservations/reservations.service';

describe('ReservationExpirationJob', () => {
  let job: ReservationExpirationJob;
  let expirePendingReservationsMock: jest.Mock;

  beforeEach(async () => {
    expirePendingReservationsMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationExpirationJob,
        {
          provide: ReservationsService,
          useValue: {
            expirePendingReservations: expirePendingReservationsMock,
          },
        },
      ],
    }).compile();

    job = module.get<ReservationExpirationJob>(ReservationExpirationJob);
  });

  describe('handle', () => {
    it('should call expirePendingReservations', async () => {
      expirePendingReservationsMock.mockResolvedValue(0);

      await job.handle();

      expect(expirePendingReservationsMock).toHaveBeenCalled();
    });

    it('should log when reservations are expired', async () => {
      expirePendingReservationsMock.mockResolvedValue(5);

      await job.handle();

      expect(expirePendingReservationsMock).toHaveBeenCalled();
    });

    it('should not log when no reservations are expired', async () => {
      expirePendingReservationsMock.mockResolvedValue(0);

      await job.handle();

      expect(expirePendingReservationsMock).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      expirePendingReservationsMock.mockRejectedValue(new Error('Database error'));

      await expect(job.handle()).resolves.not.toThrow();
    });

    it('should handle non-Error exceptions', async () => {
      expirePendingReservationsMock.mockRejectedValue('string error');

      await expect(job.handle()).resolves.not.toThrow();
    });

    it('should skip if already processing', async () => {
      expirePendingReservationsMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(1), 100)),
      );

      const firstCall = job.handle();
      const secondCall = job.handle();

      await Promise.all([firstCall, secondCall]);

      expect(expirePendingReservationsMock).toHaveBeenCalledTimes(1);
    });

    it('should reset isProcessing after completion', async () => {
      expirePendingReservationsMock.mockResolvedValue(0);

      await job.handle();
      await job.handle();

      expect(expirePendingReservationsMock).toHaveBeenCalledTimes(2);
    });

    it('should reset isProcessing after error', async () => {
      expirePendingReservationsMock
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce(0);

      await job.handle();
      await job.handle();

      expect(expirePendingReservationsMock).toHaveBeenCalledTimes(2);
    });
  });
});
