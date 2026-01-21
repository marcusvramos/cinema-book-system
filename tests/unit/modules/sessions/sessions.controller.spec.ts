import { Test, TestingModule } from '@nestjs/testing';
import { SessionsController } from '@modules/sessions/sessions.controller';
import { SessionsService } from '@modules/sessions/sessions.service';
import { CreateSessionDto } from '@modules/sessions/dto/create-session.dto';
import { NotFoundException } from '@nestjs/common';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';
import { Session } from '@modules/sessions/entities/session.entity';
import { SeatAvailabilityResponseDto } from '@modules/sessions/dto/seat-availability-response.dto';

describe('SessionsController', () => {
  let controller: SessionsController;
  let createMock: jest.Mock;
  let findAllMock: jest.Mock;
  let findByIdMock: jest.Mock;
  let getAvailabilityMock: jest.Mock;

  const mockSeat: Seat = {
    id: 'seat-123',
    seatLabel: 'A1',
    status: SeatStatus.AVAILABLE,
    sessionId: 'session-123',
    version: 1,
    createdAt: new Date(),
    session: null as unknown as Session,
  };

  const mockSession: Session = {
    id: 'session-123',
    movieTitle: 'Test Movie',
    room: 'Room 1',
    startTime: new Date(),
    ticketPrice: 25.0,
    createdAt: new Date(),
    seats: [mockSeat],
    reservations: [],
  };

  beforeEach(async () => {
    createMock = jest.fn();
    findAllMock = jest.fn();
    findByIdMock = jest.fn();
    getAvailabilityMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        {
          provide: SessionsService,
          useValue: {
            create: createMock,
            findAll: findAllMock,
            findById: findByIdMock,
            getAvailability: getAvailabilityMock,
          },
        },
      ],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  describe('create', () => {
    it('should create a session and return response dto', async () => {
      const createSessionDto: CreateSessionDto = {
        movieTitle: 'Test Movie',
        room: 'Room 1',
        startTime: new Date().toISOString(),
        ticketPrice: 25.0,
        totalSeats: 16,
      };

      createMock.mockResolvedValue(mockSession);

      const result = await controller.create(createSessionDto);

      expect(createMock).toHaveBeenCalledWith(createSessionDto);
      expect(result.id).toBe(mockSession.id);
      expect(result.movieTitle).toBe(mockSession.movieTitle);
      expect(result.room).toBe(mockSession.room);
      expect(result.ticketPrice).toBe(25.0);
      expect(result.seats).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should return all sessions', async () => {
      findAllMock.mockResolvedValue([mockSession]);

      const result = await controller.findAll();

      expect(findAllMock).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockSession.id);
    });

    it('should return empty array when no sessions', async () => {
      findAllMock.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a session by id', async () => {
      findByIdMock.mockResolvedValue(mockSession);

      const result = await controller.findOne('session-123');

      expect(findByIdMock).toHaveBeenCalledWith('session-123');
      expect(result.id).toBe(mockSession.id);
      expect(result.seats).toBeDefined();
    });

    it('should throw NotFoundException when session not found', async () => {
      findByIdMock.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailability', () => {
    it('should return seat availability', async () => {
      const availability: SeatAvailabilityResponseDto = {
        sessionId: 'session-123',
        movieTitle: 'Test Movie',
        room: 'Room 1',
        startTime: new Date(),
        ticketPrice: 25.0,
        totalSeats: 16,
        availableSeats: 14,
        reservedSeats: 1,
        soldSeats: 1,
        seats: [{ id: 'seat-1', seatLabel: 'A1', status: SeatStatus.AVAILABLE }],
      };

      getAvailabilityMock.mockResolvedValue(availability);

      const result = await controller.getAvailability('session-123');

      expect(getAvailabilityMock).toHaveBeenCalledWith('session-123');
      expect(result.availableSeats).toBe(14);
    });
  });
});
