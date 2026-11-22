import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { connectDatabase, closeDatabase, getMongoUri } from '../config/database.js'
import { Organization } from '../models/Organization.js'
import { getBillingTransactionModel, type BillingTransactionRecord } from '../models/BillingTransaction.js'
import { getUsageRecordModel, type CreateUsageRecordInput } from '../models/UsageRecord.js'
import { getTenantConnection } from '../services/tenantConnectionService.js'

const resourceNames = [
  'DEMO-IN-MUMBAI-COMPUTE',
  'DEMO-IN-BENGALURU-COMPUTE',
  'DEMO-IN-CHENNAI-STORAGE',
  'DEMO-IN-HYDERABAD-API',
  'DEMO-IN-DELHI-NETWORK',
  'DEMO-IN-PUNE-STORAGE',
  'DEMO-IN-MUMBAI-API',
  'DEMO-IN-KOLKATA-COMPUTE',
]
const idempotencyKeys = Array.from({ length: 5 }, (_, index) => `demo-india-${index + 1}`)

const usageSamples = [
  { resourceType: 'compute', usageAmount: 184, usageUnit: 'vCPU-hours', cost: 2580, currency: 'INR' },
  { resourceType: 'compute', usageAmount: 96, usageUnit: 'vCPU-hours', cost: 1344, currency: 'INR' },
  { resourceType: 'storage', usageAmount: 640, usageUnit: 'GB-months', cost: 960, currency: 'INR' },
  { resourceType: 'api_requests', usageAmount: 1_250_000, usageUnit: 'requests', cost: 625, currency: 'INR' },
  { resourceType: 'network', usageAmount: 82.5, usageUnit: 'GB', cost: 1072.5, currency: 'INR' },
  { resourceType: 'storage', usageAmount: 1280, usageUnit: 'GB-months', cost: 1920, currency: 'INR' },
  { resourceType: 'api_requests', usageAmount: 840_000, usageUnit: 'requests', cost: 420, currency: 'INR' },
  { resourceType: 'compute', usageAmount: 72, usageUnit: 'vCPU-hours', cost: 1008, currency: 'INR' },
] as const

const billingSamples = [
  { amount: 18_450.75, description: 'DEMO-IN: Mumbai compute services', status: 'successful' },
  { amount: 7_250, description: 'DEMO-IN: Bengaluru data processing', status: 'successful' },
  { amount: 2_199, description: 'DEMO-IN: Chennai storage services', status: 'successful' },
  { amount: 4_800, description: 'DEMO-IN: Hyderabad API usage', status: 'pending' },
  { amount: 1_299, description: 'DEMO-IN: Delhi network services', status: 'failed' },
] as const

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
}

function getSampleDate(index: number, count: number): Date {
  const now = new Date()
  const today = now.getUTCDate()
  const firstDay = Math.max(1, today - (count - 1) * 2)
  const day = Math.min(today, firstDay + index * 2)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 8))
}

async function getTargetOrganizationId(): Promise<string> {
  const configuredOrganizationId = process.env.SEED_ORGANIZATION_ID?.trim()
  if (configuredOrganizationId) {
    if (!isUuid(configuredOrganizationId)) {
      throw new Error('SEED_ORGANIZATION_ID must be a valid organization UUID')
    }

    const organization = await Organization.exists({ organizationId: configuredOrganizationId })
    if (!organization) throw new Error('SEED_ORGANIZATION_ID does not match an existing organization')
    return configuredOrganizationId
  }

  const organizations = await Organization.find()
    .select({ organizationId: 1, _id: 0 })
    .limit(2)
    .lean()
    .exec()
  if (organizations.length !== 1) {
    throw new Error('Set SEED_ORGANIZATION_ID when the database does not contain exactly one organization')
  }

  return organizations[0].organizationId
}

async function seedIndiaDemoData(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo records when NODE_ENV is production')
  }

  const mongoUri = getMongoUri()
  const mongoHost = new URL(mongoUri).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(mongoHost)) {
    throw new Error('The India demo seed command only supports a local MongoDB connection')
  }

  await connectDatabase()
  try {
    const organizationId = await getTargetOrganizationId()
    const tenantConnection = await getTenantConnection(organizationId)
    const UsageRecord = getUsageRecordModel(tenantConnection)
    const BillingTransaction = getBillingTransactionModel(tenantConnection)
    const clearOnly = process.argv.includes('--clear')
    const usageRecords: CreateUsageRecordInput[] = usageSamples.map((sample, index) => ({
      ...sample,
      organizationId,
      resourceName: resourceNames[index],
      recordedAt: getSampleDate(index, usageSamples.length),
    }))
    const billingTransactions: BillingTransactionRecord[] = billingSamples.map((sample, index) => {
      const createdAt = getSampleDate(index, billingSamples.length)
      return {
        transactionId: randomUUID(),
        idempotencyKey: idempotencyKeys[index],
        organizationId,
        ...sample,
        currency: 'INR',
        createdAt,
        updatedAt: createdAt,
      }
    })

    const session = await tenantConnection.startSession()
    try {
      await session.withTransaction(async () => {
        await UsageRecord.deleteMany({
          organizationId,
          resourceName: { $in: resourceNames },
        }).session(session)
        await BillingTransaction.deleteMany({
          organizationId,
          idempotencyKey: { $in: idempotencyKeys },
        }).session(session)

        if (!clearOnly) {
          await UsageRecord.insertMany(usageRecords, { session, ordered: true })
          await BillingTransaction.insertMany(billingTransactions, { session, ordered: true })
        }
      })
    } finally {
      await session.endSession()
    }

    console.info(clearOnly
      ? 'Removed India demo records from the selected organization.'
      : `Seeded ${usageRecords.length} INR usage records and ${billingTransactions.length} billing transactions for the current month.`)
  } finally {
    await closeDatabase()
  }
}

seedIndiaDemoData().catch((error: unknown) => {
  console.error('Unable to seed India demo data:', error)
  process.exitCode = 1
})
