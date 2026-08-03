import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RenewalTask, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { Paginated } from '../common/pagination';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TasksService } from './tasks.service';
import type { TaskDetail, TaskListItem } from './tasks.types';

/** อ่านได้ทุก role ที่ login แล้ว — เปลี่ยนสถานะ/มอบหมายได้ ADMIN และ OPERATOR */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query() query: ListTasksDto): Promise<Paginated<TaskListItem>> {
    return this.tasksService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TaskDetail> {
    return this.tasksService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RenewalTask> {
    return this.tasksService.create(dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RenewalTask> {
    return this.tasksService.changeStatus(id, dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RenewalTask> {
    return this.tasksService.assign(id, dto, actor);
  }
}
