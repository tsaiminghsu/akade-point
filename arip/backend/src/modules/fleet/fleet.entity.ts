import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeviceEntity } from '../device/device.entity';

@Entity('fleets')
export class FleetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @ManyToMany(() => DeviceEntity)
  @JoinTable({
    name: 'fleet_devices',
    joinColumn: { name: 'fleet_id' },
    inverseJoinColumn: { name: 'device_id' },
  })
  devices!: DeviceEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
