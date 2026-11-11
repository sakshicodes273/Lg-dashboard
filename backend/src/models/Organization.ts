import { model, Schema } from 'mongoose'

export interface OrganizationRecord {
  name: string
  organizationId: string
  createdAt: Date
}

const organizationSchema = new Schema<OrganizationRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    organizationId: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const Organization = model<OrganizationRecord>('Organization', organizationSchema)