export interface DonorRecord {
  id: string
  name: string
  address: string
  contribution: number
  initials: string
}

export type DonorDecision = 'pending' | 'approved' | 'rejected'

export interface DonorNotification {
  id: string
  proposalId: string
  donorId: string
  projectName: string
  trancheNumber: number
  fundingItem: string
  amount: number
  message: string
  sentAt: number
  decision: DonorDecision
  decidedAt?: number
}

const DATABASE_NAME = 'goodfund-local'
const DATABASE_VERSION = 1
const DONOR_STORE = 'donors'
const NOTIFICATION_STORE = 'notifications'

const initialDonors: DonorRecord[] = [
  { id: 'alice-chen', name: 'Alice Chen', address: '0x71C4...8A24', contribution: 2400, initials: 'AC' },
  { id: 'evergreen-foundation', name: 'Evergreen Foundation', address: '0x4B20...D119', contribution: 8000, initials: 'EF' },
  { id: 'anonymous-donor', name: 'Anonymous donor', address: '0xA901...0F3C', contribution: 600, initials: 'AD' },
]

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable in this browser.'))

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DONOR_STORE)) {
        database.createObjectStore(DONOR_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(NOTIFICATION_STORE)) {
        const store = database.createObjectStore(NOTIFICATION_STORE, { keyPath: 'id' })
        store.createIndex('by-donor', 'donorId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open the local donor database.'))
    request.onblocked = () => reject(new Error('The local donor database upgrade is blocked.'))
  })

  return databasePromise
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('The local database transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('The local database transaction failed.'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The local database request failed.'))
  })
}

export async function initializeDonorDatabase(): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(DONOR_STORE, 'readwrite')
  const completed = transactionComplete(transaction)
  const store = transaction.objectStore(DONOR_STORE)
  const count = store.count()
  count.onsuccess = () => {
    if (count.result === 0) initialDonors.forEach((donor) => store.add(donor))
  }
  await completed
}

export async function getDonors(): Promise<DonorRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(DONOR_STORE, 'readonly')
  const completed = transactionComplete(transaction)
  const donors = await requestResult(transaction.objectStore(DONOR_STORE).getAll() as IDBRequest<DonorRecord[]>)
  await completed
  return donors.sort((first, second) => first.name.localeCompare(second.name))
}

export async function getNotifications(): Promise<DonorNotification[]> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTIFICATION_STORE, 'readonly')
  const completed = transactionComplete(transaction)
  const notifications = await requestResult(transaction.objectStore(NOTIFICATION_STORE).getAll() as IDBRequest<DonorNotification[]>)
  await completed
  return notifications.sort((first, second) => second.sentAt - first.sentAt)
}

export async function notifyDonors(
  proposal: Omit<DonorNotification, 'id' | 'donorId' | 'sentAt' | 'decision' | 'decidedAt'>,
): Promise<number> {
  const donors = await getDonors()
  const database = await openDatabase()
  const transaction = database.transaction(NOTIFICATION_STORE, 'readwrite')
  const completed = transactionComplete(transaction)
  const store = transaction.objectStore(NOTIFICATION_STORE)
  const sentAt = Date.now()

  donors.forEach((donor) => {
    const id = `${proposal.proposalId}:${donor.id}`
    const existingRequest = store.get(id)
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as DonorNotification | undefined
      store.put({
        ...proposal,
        id,
        donorId: donor.id,
        sentAt,
        decision: existing?.decision ?? 'pending',
        decidedAt: existing?.decidedAt,
      } satisfies DonorNotification)
    }
  })

  await completed
  return donors.length
}

export async function decideNotification(
  notificationId: string,
  decision: Exclude<DonorDecision, 'pending'>,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(NOTIFICATION_STORE, 'readwrite')
  const store = transaction.objectStore(NOTIFICATION_STORE)
  return new Promise((resolve, reject) => {
    let failure: Error | undefined
    transaction.oncomplete = () => failure ? reject(failure) : resolve()
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('The local decision transaction was aborted.'))
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('The local decision transaction failed.'))

    const request = store.get(notificationId)
    request.onerror = () => {
      failure = request.error ?? new Error('Unable to read this donor notification.')
    }
    request.onsuccess = () => {
      const notification = request.result as DonorNotification | undefined
      if (!notification) {
        failure = new Error('This donor notification no longer exists.')
        transaction.abort()
        return
      }
      if (notification.decision !== 'pending') {
        failure = new Error('A decision has already been recorded for this notification.')
        transaction.abort()
        return
      }
      store.put({ ...notification, decision, decidedAt: Date.now() })
    }
  })
}