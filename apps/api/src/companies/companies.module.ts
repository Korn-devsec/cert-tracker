import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  controllers: [CompaniesController, SitesController],
  providers: [CompaniesService, SitesService],
  exports: [CompaniesService, SitesService],
})
export class CompaniesModule {}
