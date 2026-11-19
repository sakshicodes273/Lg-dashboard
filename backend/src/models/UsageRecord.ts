import { Schema, type Connection, type Model } from 'mongoose'

export const resourceTypes = ['compute', 'storage', 'api_requests', 'network'] as const

export type ResourceType = typeof resourceTypes[number]

export interface UsageRecord {
  organizationId: string
  resourceName?: string
  resourceType: ResourceType
  usageAmount: number
  usageUnit: string
  cost: number
  currency: string
  recordedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type CreateUsageRecordInput = Omit<UsageRecord, 'createdAt' | 'updatedAt'> & {
  recordedAt?: Date
}

const usageRecordSchema = new Schema<UsageRecord>(
  {
    organizationId: { type: String, required: true },
    resourceName: { type: String, trim: true, maxlength: 200 },
    resourceType: { type: String, enum: resourceTypes, required: true },
    usageAmount: { type: Number, required: true, min: 0 },
    usageUnit: { type: String, required: true, trim: true, maxlength: 40 },
    cost: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

usageRecordSchema.index({ organizationId: 1, recordedAt: -1 })
usageRecordSchema.index({ organizationId: 1, resourceType: 1, recordedAt: -1 })

export function getUsageRecordModel(connection: Connection): Model<UsageRecord> {
  return connection.models.UsageRecord
    ? connection.model<UsageRecord>('UsageRecord')
    : connection.model<UsageRecord>('UsageRecord', usageRecordSchema)
}
