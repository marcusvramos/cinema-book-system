import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SessionsService } from '@modules/sessions/sessions.service';
import { Session } from '@modules/sessions/entities/session.entity';
import { Seat, SeatStatus } from '@modules/sessions/entities/seat.entity';

type SeatData = Partial<Seat>;

describe('SessionsService', () => {
  let service: SessionsService;

  const mockSessionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSeatRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepository,
        },
        {
          provide: getRepositoryToken(Seat),
          useValue: mockSeatRepository,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const createSessionDto = {
      movieTitle: 'Avengers: Endgame',
      room: 'Sala 1',
      startTime: '2026-01-30T19:00:00Z',
      ticketPrice: 25.0,
      totalSeats: 16,
    };

    it('should create a session with seats successfully', async () => {
      const savedSession = {
        id: 'session-uuid',
        movieTitle: 'Avengers: Endgame',
        room: 'Sala 1',
        startTime: new Date('2026-01-30T19:00:00Z'),
        ticketPrice: 25.0,
        createdAt: new Date(),
      };

      const sessionWithSeats = {
        ...savedSession,
        seats: Array(16)
          .fill(null)
          .map((_, i) => ({
            id: `seat-${i}`,
            seatLabel: `A${i + 1}`,
            status: SeatStatus.AVAILABLE,
          })),
      };

      mockSessionRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sessionWithSeats);
      mockSessionRepository.create.mockReturnValue(savedSession);
      mockSessionRepository.save.mockResolvedValue(savedSession);
      mockSeatRepository.create.mockImplementation((data: SeatData): SeatData => data);
      mockSeatRepository.save.mockResolvedValue([]);

      const result = await service.create(createSessionDto);

      expect(result).toEqual(sessionWithSeats);
      expect(mockSessionRepository.create).toHaveBeenCalledWith({
        movieTitle: 'Avengers: Endgame',
        room: 'Sala 1',
        startTime: new Date('2026-01-30T19:00:00Z'),
        ticketPrice: 25.0,
      });
      expect(mockSeatRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if session already exists for room and time', async () => {
      mockSessionRepository.findOne.mockResolvedValue({
        id: 'existing-session',
      });

      await expect(service.create(createSessionDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createSessionDto)).rejects.toThrow(
        'Session already exists for this room and time',
      );
      expect(mockSessionRepository.save).not.toHaveBeenCalled();
    });

    it('should generate correct number of seats', async () => {
      const savedSession = { id: 'session-uuid' };

      mockSessionRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...savedSession, seats: [] });
      mockSessionRepository.create.mockReturnValue(savedSession);
      mockSessionRepository.save.mockResolvedValue(savedSession);

      let savedSeats: Seat[] = [];
      mockSeatRepository.create.mockImplementation((data: SeatData): SeatData => data);
      mockSeatRepository.save.mockImplementation((seats: Seat[]) => {
        savedSeats = seats;
        return Promise.resolve(seats);
      });

      await service.create({ ...createSessionDto, totalSeats: 20 });

      expect(savedSeats).toHaveLength(20);
    });

    it('should generate seats with correct labels (A1, A2, ..., B1, B2, ...)', async () => {
      const savedSession = { id: 'session-uuid' };

      mockSessionRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...savedSession, seats: [] });
      mockSessionRepository.create.mockReturnValue(savedSession);
      mockSessionRepository.save.mockResolvedValue(savedSession);

      let savedSeats: Seat[] = [];
      mockSeatRepository.create.mockImplementation((data: SeatData): SeatData => data);
      mockSeatRepository.save.mockImplementation((seats: Seat[]) => {
        savedSeats = seats;
        return Promise.resolve(seats);
      });

      await service.create({ ...createSessionDto, totalSeats: 10 });

      expect(savedSeats[0].seatLabel).toBe('A1');
      expect(savedSeats[7].seatLabel).toBe('A8');
      expect(savedSeats[8].seatLabel).toBe('B1');
      expect(savedSeats[9].seatLabel).toBe('B2');
    });
  });

  describe('findAll', () => {
    it('should return all sessions ordered by start time', async () => {
      const sessions = [
        { id: '1', movieTitle: 'Movie A', startTime: new Date('2026-01-30') },
        { id: '2', movieTitle: 'Movie B', startTime: new Date('2026-01-31') },
      ];

      mockSessionRepository.find.mockResolvedValue(sessions);

      const result = await service.findAll();

      expect(result).toEqual(sessions);
      expect(mockSessionRepository.find).toHaveBeenCalledWith({
        order: { startTime: 'ASC' },
      });
    });
  });

  describe('findById', () => {
    it('should return session with seats when found', async () => {
      const session = {
        id: 'session-uuid',
        movieTitle: 'Avengers',
        seats: [{ id: 'seat-1', seatLabel: 'A1' }],
      };

      mockSessionRepository.findOne.mockResolvedValue(session);

      const result = await service.findById('session-uuid');

      expect(result).toEqual(session);
      expect(mockSessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'session-uuid' },
        relations: ['seats'],
      });
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('non-existent')).rejects.toThrow(
        'Session with ID non-existent not found',
      );
    });
  });

  describe('getAvailability', () => {
    it('should return seat availability statistics', async () => {
      const session = {
        id: 'session-uuid',
        movieTitle: 'Avengers',
        room: 'Sala 1',
        startTime: new Date('2026-01-30T19:00:00Z'),
        ticketPrice: 25.0,
        seats: [],
      };

      const seats = [
        { id: '1', seatLabel: 'A1', status: SeatStatus.AVAILABLE },
        { id: '2', seatLabel: 'A2', status: SeatStatus.AVAILABLE },
        { id: '3', seatLabel: 'A3', status: SeatStatus.RESERVED },
        { id: '4', seatLabel: 'A4', status: SeatStatus.SOLD },
      ];

      mockSessionRepository.findOne.mockResolvedValue(session);
      mockSeatRepository.find.mockResolvedValue(seats);

      const result = await service.getAvailability('session-uuid');

      expect(result.totalSeats).toBe(4);
      expect(result.availableSeats).toBe(2);
      expect(result.reservedSeats).toBe(1);
      expect(result.soldSeats).toBe(1);
      expect(result.movieTitle).toBe('Avengers');
      expect(result.seats).toHaveLength(4);
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.getAvailability('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
