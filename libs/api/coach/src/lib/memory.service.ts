import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  Memory,
  MemoryCategory,
  MemoryCreate,
  MemoryUpdate,
} from 'data-models';

/**
 * Long-term facts the AI coach should remember across sessions. Writes
 * here are typically initiated by the LLM via tool-calls (Phase 2); the
 * user reads + deletes via the Profile page (transparency).
 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, opts: { category?: MemoryCategory } = {}): Promise<Memory[]> {
    const rows = await this.prisma.memory.findMany({
      where: { userId, ...(opts.category ? { category: opts.category } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, input: MemoryCreate): Promise<Memory> {
    const row = await this.prisma.memory.create({
      data: { userId, category: input.category, content: input.content },
    });
    return toDto(row);
  }

  async update(userId: string, id: string, patch: MemoryUpdate): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Memory not found');
    const row = await this.prisma.memory.update({
      where: { id },
      data: {
        ...(patch.category != null ? { category: patch.category } : {}),
        ...(patch.content != null ? { content: patch.content } : {}),
      },
    });
    return toDto(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Memory not found');
    await this.prisma.memory.delete({ where: { id } });
  }
}

function toDto(row: {
  id: string;
  category: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): Memory {
  return {
    id: row.id,
    category: row.category as MemoryCategory,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
