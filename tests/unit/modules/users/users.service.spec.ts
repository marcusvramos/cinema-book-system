import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '@modules/users/users.service';
import { User } from '@modules/users/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto = {
      name: 'John Doe',
      email: 'john@example.com',
    };

    it('should create a new user successfully', async () => {
      const expectedUser = {
        id: 'uuid-123',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(expectedUser);
      mockUserRepository.save.mockResolvedValue(expectedUser);

      const result = await service.create(createUserDto);

      expect(result).toEqual(expectedUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should normalize email to lowercase', async () => {
      const dtoWithUppercase = {
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({});
      mockUserRepository.save.mockResolvedValue({ id: 'uuid-123' });

      await service.create(dtoWithUppercase);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should trim whitespace from name and email', async () => {
      const dtoWithWhitespace = {
        name: '  John Doe  ',
        email: '  john@example.com  ',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({});
      mockUserRepository.save.mockResolvedValue({ id: 'uuid-123' });

      await service.create(dtoWithWhitespace);

      expect(mockUserRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createUserDto)).rejects.toThrow('Email already registered');
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a user when found', async () => {
      const expectedUser = {
        id: 'uuid-123',
        name: 'John Doe',
        email: 'john@example.com',
      };

      mockUserRepository.findOne.mockResolvedValue(expectedUser);

      const result = await service.findById('uuid-123');

      expect(result).toEqual(expectedUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-123' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findById('non-existent-id')).rejects.toThrow(
        'User with ID non-existent-id not found',
      );
    });
  });
});
