import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SchoolService } from './school.service.js';

@Controller('schools')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  // @Post()
  // create(@Body() createSchoolDto: CreateSchoolDto) {
  //   return this.schoolService.create(createSchoolDto);
  // }

  @Get()
  findAll() {
    return this.schoolService.findAll();
  }

}
