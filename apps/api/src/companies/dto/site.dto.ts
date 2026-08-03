import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @MinLength(1, { message: 'ต้องกรอกชื่อ site' })
  @MaxLength(200)
  name!: string;
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
