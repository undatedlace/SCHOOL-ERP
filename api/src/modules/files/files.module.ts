import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FILE_STORAGE } from './storage/file-storage.js';
import { LocalFileStorage } from './storage/local-file-storage.js';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      // Local disk for now. An S3 implementation of FileStorage replaces this one line later.
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalFileStorage(config.get<string>('FILES_DIR') ?? './storage'),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
