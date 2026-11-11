import { model, Schema } from 'mongoose'

export type UserRole = 'owner' | 'admin' | 'member'

export interface UserRecord {
  name: string
  email: string
  password: string
  organizationId: string
  role: UserRole
}

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },
    organizationId: { type: String, required: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'owner', required: true },
  },
  { timestamps: true },
)

export const User = model<UserRecord>('User', userSchema)