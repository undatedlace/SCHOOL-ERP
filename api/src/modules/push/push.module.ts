import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUSH_SENDER, createPushSender, OffPushSender } from './push-sender.js';
import { PushService } from './push.service.js';

/** The push channel. `PUSH_DRIVER` is off (default), log or expo. Tests always get "off" unless they inject a fake. */
@Module({
  providers: [
    {
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('NODE_ENV') === 'test'
          ? new OffPushSender()
          : createPushSender(
              config.get<string>('PUSH_DRIVER'),
              config.get<string>('EXPO_ACCESS_TOKEN'),
            ),
    },
    PushService,
  ],
  exports: [PushService],
})
export class PushModule {}
