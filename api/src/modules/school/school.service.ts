import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SchoolService {

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.school.findMany();
  }
}
