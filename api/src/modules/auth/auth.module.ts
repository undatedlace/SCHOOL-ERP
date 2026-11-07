import { Module } from '@nestjs/common';
import { SchoolModule } from '../school/school.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [SchoolModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
