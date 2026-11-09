import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';

@Module({
  imports: [FeesModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
