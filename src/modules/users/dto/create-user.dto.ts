import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @Length(2, 255)
  name: string;

  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  @Length(5, 255)
  email: string;
}
