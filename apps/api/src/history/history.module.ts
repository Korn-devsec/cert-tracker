import { Global, Module } from '@nestjs/common';
import { HistoryService } from './history.service';

@Global()
@Module({
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
