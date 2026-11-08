import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FILE_STORAGE } from './storage/file-storage.js';
import { createFileStorage } from './storage/create-file-storage.js';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      // Local disk or S3, chosen by FILES_DRIVER (see create-file-storage.ts).
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createFileStorage((name) => config.get<string>(name)),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
