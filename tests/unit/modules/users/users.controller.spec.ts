import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '@modules/users/users.controller';
import { UsersService } from '@modules/users/users.service';
import { CreateUserDto } from '@modules/users/dto/create-user.dto';
import { NotFoundException } from '@nestjs/common';
import { User } from '@modules/users/entities/user.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let createMock: jest.Mock;
  let findByIdMock: jest.Mock;

  const mockUser: User = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date(),
    reservations: [],
    sales: [],
  };

  beforeEach(async () => {
    createMock = jest.fn();
    findByIdMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: createMock,
            findById: findByIdMock,
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('create', () => {
    it('should create a user and return response dto', async () => {
      const createUserDto: CreateUserDto = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      createMock.mockResolvedValue(mockUser);

      const result = await controller.create(createUserDto);

      expect(createMock).toHaveBeenCalledWith(createUserDto);
      expect(result).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        createdAt: mockUser.createdAt,
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      findByIdMock.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-123');

      expect(findByIdMock).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        createdAt: mockUser.createdAt,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      findByIdMock.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });
});
