import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller.js';

@Module({ controllers: [RbacController] })
export class RbacModule {}
