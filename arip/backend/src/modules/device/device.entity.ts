import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { DeviceType, DeviceStatus, DeviceHealth } from '@arip/sdk';

@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 100 })
  type!: DeviceType;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ name: 'ip_address', nullable: true, length: 45 })
  ipAddress?: string;

  @Column({ name: 'firmware_version', nullable: true, length: 50 })
  firmwareVersion?: string;

  @Column({ length: 20, default: 'offline' })
  status!: DeviceStatus;

  @Column({ length: 20, default: 'unknown' })
  health!: DeviceHealth;

  @Column({ name: 'last_seen_at', nullable: true, type: 'timestamptz' })
  lastSeenAt?: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
