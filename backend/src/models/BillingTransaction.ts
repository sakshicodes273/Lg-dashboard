import { Schema, type Connection, type Model } from 'mongoose'

export type BillingTransactionStatus = 'pending' | 'successful' | 'failed'

export interface BillingTransactionRecord {
  transactionId: string
  idempotencyKey: string
  organizationId: string
  amount: number
  currency: string
  description: string
  status: BillingTransactionStatus
  createdAt: Date
  updatedAt: Date
}

const billingTransactionSchema = new Schema<BillingTransactionRecord>(
  {
    transactionId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    organizationId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    description: { type: String, required: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'successful', 'failed'],
      default: 'pending',
      required: true,
    },
  },
  { timestamps: true },
)

billingTransactionSchema.index({ transactionId: 1 }, { unique: true })
billingTransactionSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true })

export function getBillingTransactionModel(connection: Connection): Model<BillingTransactionRecord> {
  return connection.models.BillingTransaction
    ? connection.model<BillingTransactionRecord>('BillingTransaction')
    : connection.model<BillingTransactionRecord>('BillingTransaction', billingTransactionSchema)
}
