import { useCallback, useEffect, useState } from 'react'
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  ZeroHash,
  formatEther,
  getAddress,
  parseEther,
  type Eip1193Provider,
  type EventLog,
} from 'ethers'

export const LOCAL_CHAIN_ID = 31337
export const LOCAL_CHAIN_ID_HEX = '0x7a69'
export const LOCAL_RPC_URL = import.meta.env.VITE_LOCAL_RPC_URL ?? 'http://127.0.0.1:8545'
export const WELFARE_FUND_ADDRESS =
  import.meta.env.VITE_WELFARE_FUND_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3'
export const isLocalDemoWalletEnabled =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO_WALLET !== 'false'
export const DEMO_USD_PER_ETH = 2000
const TRANSACTION_CONFIRMATION_TIMEOUT_MS = 90_000

const LOCAL_DEMO_ACCOUNT_KEY = 'goodfund:local-demo-account'

const localChainParameters = {
  chainId: LOCAL_CHAIN_ID_HEX,
  chainName: 'GoodFund Localhost',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: [LOCAL_RPC_URL],
}

const welfareFundAbi = [
  'function deposit() payable',
  'function donorCount() view returns (uint256)',
  'function totalReceived() view returns (uint256)',
  'function isDonor(address) view returns (bool)',
  'function manager() view returns (address)',
  'function phase() view returns (uint8)',
  'function currentTranche() view returns (uint256)',
  'function proposePayout(address recipient, uint256 amount, string purpose, bytes32 approvalMaterialHash, string approvalMaterialUri)',
  'function approvePayout()',
  'function opposePayout()',
  'function executePayout()',
  'function confirmExecution(bytes32 evidenceHash, string evidenceUri)',
  'function lastExecutionEvidenceHash() view returns (bytes32)',
  'function lastExecutionEvidenceUri() view returns (string)',
  'function proposedAmount() view returns (uint256)',
  'function proposedRecipient() view returns (address)',
  'function proposedPurpose() view returns (string)',
  'function proposedApprovalMaterialHash() view returns (bytes32)',
  'function proposedApprovalMaterialUri() view returns (string)',
  'function currentProposalId() view returns (uint256)',
  'function approvalsForCurrentTranche() view returns (uint256)',
  'function oppositionsForCurrentTranche() view returns (uint256)',
  'function votesForCurrentTranche() view returns (uint256)',
  'function approvedForProposal(uint256 proposalId, address donor) view returns (bool)',
  'function opposedForProposal(uint256 proposalId, address donor) view returns (bool)',
  'event PayoutProposed(uint256 indexed proposalId, uint256 indexed tranche, address indexed recipient, uint256 amount, string purpose, bytes32 approvalMaterialHash, string approvalMaterialUri)',
  'event PayoutRejected(uint256 indexed proposalId, uint256 indexed tranche, uint256 approvals, uint256 oppositions)',
  'event ExecutionReported(uint256 indexed tranche, bytes32 evidenceHash, string evidenceUri)',
] as const

type InjectedProvider = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: InjectedProvider
  }
}

const readProvider = new JsonRpcProvider(LOCAL_RPC_URL, LOCAL_CHAIN_ID, {
  staticNetwork: true,
})

export interface ChainSnapshot {
  balanceEth: string
  totalReceivedEth: string
  donorCount: number
  manager: string
  phase: number
  currentTranche: number
  isDonor: boolean
  proposedAmountEth: string
  proposedRecipient: string
  proposedPurpose: string
  proposedApprovalMaterialHash: string
  proposedApprovalMaterialUri: string
  recipientBalanceEth: string
  hasActiveProposal: boolean
  lastExecutionEvidenceHash: string
  lastExecutionEvidenceUri: string
  currentProposalId: number
  approvals: number
  oppositions: number
  votes: number
  hasApproved: boolean
  hasOpposed: boolean
  knownDonors: KnownChainDonor[]
  latestRejection: ProposalRejection | null
}

export interface KnownChainDonor {
  address: string
  label: string
  approved: boolean
  opposed: boolean
}

export interface ProposalRejection {
  proposalId: number
  tranche: number
  approvals: number
  oppositions: number
  purpose: string
  amountEth: string
  recipient: string
  transactionHash: string
  blockNumber: number
}

export interface TransactionState {
  status: 'idle' | 'pending' | 'success' | 'error'
  hash: string
  message: string
}

const EMPTY_TRANSACTION: TransactionState = {
  status: 'idle',
  hash: '',
  message: '',
}

const phaseLabels = [
  'Funding',
  'Awaiting approval',
  'Ready to disburse',
  'Awaiting execution report',
] as const

export const demoWalletLabels: Record<string, string> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': 'Executor wallet',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 'Donor A',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 'Donor B',
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906': 'Payout recipient',
}

export const localDemoAccounts = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    label: 'Executor / Manager',
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    label: 'Donor A',
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    label: 'Donor B',
  },
] as const

export function shortAddress(address?: string | null) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function walletLabel(address?: string | null) {
  if (!address) return 'Wallet not connected'
  return demoWalletLabels[address.toLowerCase()] ?? 'Connected wallet'
}

export function phaseLabel(phase?: number) {
  if (phase === undefined) return 'Loading'
  return phaseLabels[phase] ?? `Unknown phase ${phase}`
}

export function formatUsdFromEth(eth?: string | null) {
  if (!eth) return '—'
  const value = Number(eth.replaceAll(',', ''))
  if (!Number.isFinite(value)) return '—'
  return (value * DEMO_USD_PER_ETH).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function demoEthFromUsd(usd: string) {
  const value = Number(usd.trim().replaceAll(',', ''))
  if (!Number.isFinite(value) || value <= 0) return ''
  return (value / DEMO_USD_PER_ETH)
    .toFixed(6)
    .replace(/\.?0+$/, '')
}

function formatEth(value: bigint) {
  const numericValue = Number(formatEther(value))
  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: numericValue > 0 && numericValue < 0.01 ? 4 : 0,
    maximumFractionDigits: 4,
  })
}

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined
  if ('code' in error) return (error as { code?: unknown }).code
  return undefined
}

export function walletErrorMessage(error: unknown) {
  if (errorCode(error) === 4001 || errorCode(error) === 'ACTION_REJECTED') {
    return 'You rejected the wallet request. No transaction was sent.'
  }
  if (errorCode(error) === 'TIMEOUT') {
    return 'The transaction was submitted but did not confirm within 90 seconds. Check MetaMask activity data and wallet nonce, then refresh the page.'
  }

  if (typeof error === 'object' && error !== null) {
    const shortMessage = 'shortMessage' in error ? (error as { shortMessage?: unknown }).shortMessage : undefined
    if (typeof shortMessage === 'string' && shortMessage.trim()) {
      return shortMessage.replace(/^execution reverted:\s*/i, '')
    }
    const message = 'message' in error ? (error as { message?: unknown }).message : undefined
    if (typeof message === 'string' && message.trim()) {
      return message.replace(/^execution reverted:\s*/i, '')
    }
  }

  return 'The wallet request could not be completed.'
}

async function readSnapshot(account: string | null): Promise<ChainSnapshot> {
  const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, readProvider)
  const [
    balance,
    donorCountValue,
    totalReceivedValue,
    managerValue,
    phaseValue,
    trancheValue,
    proposedAmountValue,
    proposedRecipientValue,
    proposalIdValue,
    approvalsValue,
    oppositionsValue,
    votesValue,
    proposedPurposeValue,
    approvalMaterialHashValue,
    approvalMaterialUriValue,
    lastExecutionEvidenceHashValue,
    lastExecutionEvidenceUriValue,
  ] = await Promise.all([
    readProvider.getBalance(WELFARE_FUND_ADDRESS),
    contract.donorCount() as Promise<bigint>,
    contract.totalReceived() as Promise<bigint>,
    contract.manager() as Promise<string>,
    contract.phase() as Promise<bigint>,
    contract.currentTranche() as Promise<bigint>,
    contract.proposedAmount() as Promise<bigint>,
    contract.proposedRecipient() as Promise<string>,
    contract.currentProposalId() as Promise<bigint>,
    contract.approvalsForCurrentTranche() as Promise<bigint>,
    contract.oppositionsForCurrentTranche() as Promise<bigint>,
    contract.votesForCurrentTranche() as Promise<bigint>,
    contract.proposedPurpose() as Promise<string>,
    contract.proposedApprovalMaterialHash() as Promise<string>,
    contract.proposedApprovalMaterialUri() as Promise<string>,
    contract.lastExecutionEvidenceHash() as Promise<string>,
    contract.lastExecutionEvidenceUri() as Promise<string>,
  ])
  const manager = getAddress(managerValue)
  const currentProposalId = Number(proposalIdValue)
  const proposedRecipient = getAddress(proposedRecipientValue)
  const hasActiveProposal = currentProposalId > 0
    && (Number(phaseValue) !== 0 || proposedAmountValue > 0n)
  const [isDonor, recipientBalance, voteState, knownDonors] = await Promise.all([
    account ? contract.isDonor(account) as Promise<boolean> : Promise.resolve(false),
    proposedRecipient === ZeroAddress
      ? Promise.resolve(0n)
      : readProvider.getBalance(proposedRecipient),
    account && hasActiveProposal
    ? await Promise.all([
      contract.approvedForProposal(currentProposalId, account) as Promise<boolean>,
      contract.opposedForProposal(currentProposalId, account) as Promise<boolean>,
    ])
      : Promise.resolve([false, false] as [boolean, boolean]),
    Promise.all(
      localDemoAccounts
        .filter((entry) => entry.address.toLowerCase() !== manager.toLowerCase())
        .map(async (entry): Promise<KnownChainDonor | null> => {
          const registered = await contract.isDonor(entry.address) as boolean
          if (!registered) return null
          const [approved, opposed] = hasActiveProposal
            ? await Promise.all([
              contract.approvedForProposal(currentProposalId, entry.address) as Promise<boolean>,
              contract.opposedForProposal(currentProposalId, entry.address) as Promise<boolean>,
            ])
            : [false, false]
          return {
            address: entry.address,
            label: entry.label,
            approved,
            opposed,
          }
        }),
    ),
  ])
  const [hasApproved, hasOpposed] = voteState

  let latestRejection: ProposalRejection | null = null
  const [proposedEvents, rejectedEvents] = await Promise.all([
    contract.queryFilter(contract.filters.PayoutProposed()) as Promise<EventLog[]>,
    contract.queryFilter(contract.filters.PayoutRejected()) as Promise<EventLog[]>,
  ])
  const latestRejectedEvent = rejectedEvents[rejectedEvents.length - 1]
  if (latestRejectedEvent) {
    const proposalId = Number(latestRejectedEvent.args.proposalId)
    const matchingProposal = [...proposedEvents]
      .reverse()
      .find((event) => Number(event.args.proposalId) === proposalId)
    latestRejection = {
      proposalId,
      tranche: Number(latestRejectedEvent.args.tranche),
      approvals: Number(latestRejectedEvent.args.approvals),
      oppositions: Number(latestRejectedEvent.args.oppositions),
      purpose: matchingProposal ? String(matchingProposal.args.purpose) : 'Payout proposal',
      amountEth: matchingProposal ? formatEth(matchingProposal.args.amount as bigint) : '0',
      recipient: matchingProposal ? getAddress(matchingProposal.args.recipient) : ZeroAddress,
      transactionHash: latestRejectedEvent.transactionHash,
      blockNumber: latestRejectedEvent.blockNumber,
    }
  }

  return {
    balanceEth: formatEth(balance),
    totalReceivedEth: formatEth(totalReceivedValue),
    donorCount: Number(donorCountValue),
    manager,
    phase: Number(phaseValue),
    currentTranche: Number(trancheValue),
    isDonor,
    proposedAmountEth: formatEth(proposedAmountValue),
    proposedRecipient,
    proposedPurpose: proposedPurposeValue,
    proposedApprovalMaterialHash: approvalMaterialHashValue,
    proposedApprovalMaterialUri: approvalMaterialUriValue,
    recipientBalanceEth: formatEth(recipientBalance),
    hasActiveProposal,
    currentProposalId,
    approvals: Number(approvalsValue),
    oppositions: Number(oppositionsValue),
    votes: Number(votesValue),
    lastExecutionEvidenceHash: lastExecutionEvidenceHashValue,
    lastExecutionEvidenceUri: lastExecutionEvidenceUriValue,
    hasApproved,
    hasOpposed,
    knownDonors: knownDonors.filter((donor): donor is KnownChainDonor => donor !== null),
    latestRejection,
  }
}

function storedLocalDemoAccount() {
  const saved = window.localStorage.getItem(LOCAL_DEMO_ACCOUNT_KEY)
  return localDemoAccounts.find((entry) => entry.address.toLowerCase() === saved?.toLowerCase())
    ?.address ?? localDemoAccounts[0].address
}

function localDemoProvider(account: string): InjectedProvider {
  return {
    request: async ({ method, params }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [account]
      }
      if (method === 'eth_chainId') {
        return LOCAL_CHAIN_ID_HEX
      }
      if (method === 'net_version') {
        return String(LOCAL_CHAIN_ID)
      }
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        return null
      }
      return readProvider.send(method, Array.isArray(params) ? params : [])
    },
  }
}

function injectedProvider(account?: string | null) {
  if (isLocalDemoWalletEnabled) {
    return localDemoProvider(account ?? storedLocalDemoAccount())
  }
  if (!window.ethereum) {
    throw new Error('A browser wallet was not detected. Install MetaMask, Rabby, or another EVM wallet.')
  }
  return window.ethereum
}

async function requestChainId(provider: InjectedProvider) {
  const value = (await provider.request({ method: 'eth_chainId' })) as string
  return Number(BigInt(value))
}

export function useLocalChainFund() {
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [localAccount, setLocalAccount] = useState<string | null>(
    isLocalDemoWalletEnabled ? storedLocalDemoAccount() : null,
  )
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [switchingNetwork, setSwitchingNetwork] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [transaction, setTransaction] = useState<TransactionState>(EMPTY_TRANSACTION)
  const [proposalSubmitting, setProposalSubmitting] = useState(false)
  const [proposalTransaction, setProposalTransaction] = useState<TransactionState>(EMPTY_TRANSACTION)
  const [voteSubmitting, setVoteSubmitting] = useState(false)
  const [voteTransaction, setVoteTransaction] = useState<TransactionState>(EMPTY_TRANSACTION)
  const [executionSubmitting, setExecutionSubmitting] = useState(false)
  const [executionTransaction, setExecutionTransaction] = useState<TransactionState>(EMPTY_TRANSACTION)
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false)
  const [evidenceTransaction, setEvidenceTransaction] = useState<TransactionState>(EMPTY_TRANSACTION)

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await readSnapshot(account)
      setSnapshot(nextSnapshot)
      setSnapshotError('')
    } catch (error) {
      setSnapshotError(walletErrorMessage(error))
    }
  }, [account])

  useEffect(() => {
    void refresh()
    const pollId = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(pollId)
  }, [refresh])

  useEffect(() => {
    if (isLocalDemoWalletEnabled) return
    const provider = window.ethereum
    if (!provider) return
    const walletProvider: InjectedProvider = provider

    let active = true

    async function restoreConnection() {
      try {
        const [accounts, currentChainId] = await Promise.all([
          walletProvider.request({ method: 'eth_accounts' }) as Promise<string[]>,
          requestChainId(walletProvider),
        ])
        if (!active) return
        setAccount(accounts[0] ? getAddress(accounts[0]) : null)
        setChainId(currentChainId)
      } catch {
        // A locked or unavailable wallet should not block read-only contract data.
      }
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : []
      setAccount(accounts[0] ? getAddress(accounts[0]) : null)
      setTransaction(EMPTY_TRANSACTION)
      setProposalTransaction(EMPTY_TRANSACTION)
      setVoteTransaction(EMPTY_TRANSACTION)
      setExecutionTransaction(EMPTY_TRANSACTION)
      setEvidenceTransaction(EMPTY_TRANSACTION)
      setWalletError('')
    }

    const handleChainChanged = (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        setChainId(Number(BigInt(args[0])))
      }
      setTransaction(EMPTY_TRANSACTION)
      setProposalTransaction(EMPTY_TRANSACTION)
      setVoteTransaction(EMPTY_TRANSACTION)
      setExecutionTransaction(EMPTY_TRANSACTION)
      setEvidenceTransaction(EMPTY_TRANSACTION)
      setWalletError('')
    }

    void restoreConnection()
    walletProvider.on?.('accountsChanged', handleAccountsChanged)
    walletProvider.on?.('chainChanged', handleChainChanged)

    return () => {
      active = false
      walletProvider.removeListener?.('accountsChanged', handleAccountsChanged)
      walletProvider.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setWalletError('')
    try {
      if (isLocalDemoWalletEnabled) {
        const nextAccount = localAccount ?? localDemoAccounts[0].address
        setLocalAccount(nextAccount)
        setAccount(nextAccount)
        setChainId(LOCAL_CHAIN_ID)
        return
      }
      const provider = injectedProvider()
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      if (!accounts[0]) {
        throw new Error('The wallet did not return an account.')
      }
      setAccount(getAddress(accounts[0]))
      setChainId(await requestChainId(provider))
    } catch (error) {
      setWalletError(walletErrorMessage(error))
    } finally {
      setConnecting(false)
    }
  }, [localAccount])

  const switchToLocalhost = useCallback(async () => {
    if (isLocalDemoWalletEnabled) return
    setSwitchingNetwork(true)
    setWalletError('')
    try {
      const provider = injectedProvider()
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: LOCAL_CHAIN_ID_HEX }],
        })
      } catch (error) {
        if (errorCode(error) !== 4902) throw error
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [localChainParameters],
        })
      }
      setChainId(await requestChainId(provider))
    } catch (error) {
      setWalletError(walletErrorMessage(error))
    } finally {
      setSwitchingNetwork(false)
    }
  }, [])

  const donate = useCallback(
    async (amount: string) => {
      setWalletError('')

      if (!account) {
        setWalletError('Connect a wallet before donating.')
        return
      }
      if (chainId !== LOCAL_CHAIN_ID) {
        setWalletError('Switch your browser wallet to GoodFund Localhost before donating.')
        return
      }
      if (snapshot?.phase !== 0) {
        setWalletError('Donations are paused while the current payout proposal is active.')
        return
      }

      let value: bigint
      try {
        value = parseEther(amount.trim())
        if (value <= 0n) throw new Error('Enter a donation greater than zero.')
      } catch (error) {
        setTransaction({
          status: 'error',
          hash: '',
          message: error instanceof Error ? error.message : 'Enter a valid ETH amount.',
        })
        return
      }

      setSubmitting(true)
      setTransaction({
        status: 'pending',
        hash: '',
        message: 'Confirm the donation in your browser wallet.',
      })

      let pendingHash = ''
      try {
        const provider = new BrowserProvider(injectedProvider(account), 'any')
        const signer = await provider.getSigner()
        const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, signer)
        const response = await contract.deposit({ value })
        pendingHash = response.hash
        setTransaction({
          status: 'pending',
          hash: pendingHash,
          message: 'Transaction submitted. Waiting for confirmation.',
        })
        const receipt = await response.wait(1, TRANSACTION_CONFIRMATION_TIMEOUT_MS)
        if (!receipt || receipt.status !== 1) {
          throw new Error('The donation transaction did not complete successfully.')
        }
        setTransaction({
          status: 'success',
          hash: pendingHash,
          message: 'Donation confirmed. The contract balance and donor count are up to date.',
        })
        await refresh()
      } catch (error) {
        setTransaction({
          status: 'error',
          hash: pendingHash,
          message: walletErrorMessage(error),
        })
      } finally {
        setSubmitting(false)
      }
    },
    [account, chainId, refresh, snapshot?.phase],
  )

  const clearTransaction = useCallback(() => setTransaction(EMPTY_TRANSACTION), [])

  const proposePayout = useCallback(
    async (recipient: string, amount: string, purpose: string, approvalMaterialHash: string, approvalMaterialUri: string) => {
      setWalletError('')
      setProposalTransaction(EMPTY_TRANSACTION)

      if (!account) {
        setWalletError('Connect a wallet before creating a proposal.')
        return
      }
      if (chainId !== LOCAL_CHAIN_ID) {
        setWalletError('Switch to GoodFund Localhost before creating a proposal.')
        return
      }
      if (snapshot && account.toLowerCase() !== snapshot.manager.toLowerCase()) {
        setWalletError('Only the executor manager can create a payout proposal.')
        return
      }
      if (snapshot?.phase !== 0) {
        setWalletError('A payout proposal is already active for the current tranche.')
        return
      }

      let recipientAddress: string
      let value: bigint
      let normalizedMaterialHash: string
      let normalizedPurpose: string
      let normalizedMaterialUri: string
      try {
        recipientAddress = getAddress(recipient.trim())
        if (recipientAddress === ZeroAddress) {
          throw new Error('Recipient cannot be the zero address.')
        }
        value = parseEther(amount.trim())
        if (value <= 0n) {
          throw new Error('Proposal amount must be greater than zero.')
        }
        const balance = await readProvider.getBalance(WELFARE_FUND_ADDRESS)
        if (value > balance) {
          throw new Error('Proposal amount exceeds the contract balance.')
        }
        normalizedPurpose = purpose.trim()
        if (!normalizedPurpose) throw new Error('Add a purpose for this payout proposal.')
        if (normalizedPurpose.length > 280) throw new Error('The payout purpose must be 280 characters or fewer.')
        normalizedMaterialHash = approvalMaterialHash.trim().toLowerCase()
        if (!/^0x[0-9a-f]{64}$/.test(normalizedMaterialHash) || normalizedMaterialHash === ZeroHash) {
          throw new Error('Upload or verify the approval material before proposing the payout.')
        }
        normalizedMaterialUri = approvalMaterialUri.trim()
        if (!normalizedMaterialUri) throw new Error('The approval material needs an accessible address.')
        if (normalizedMaterialUri.length > 512) throw new Error('The approval material address is too long.')
      } catch (error) {
        setProposalTransaction({
          status: 'error',
          hash: '',
          message: error instanceof Error ? error.message : 'Enter a valid recipient and amount.',
        })
        return
      }

      setProposalSubmitting(true)
      setProposalTransaction({
        status: 'pending',
        hash: '',
        message: isLocalDemoWalletEnabled
          ? 'Submitting the payout proposal to Anvil.'
          : 'Confirm the payout proposal in your browser wallet.',
      })

      let pendingHash = ''
      try {
        const provider = new BrowserProvider(injectedProvider(account), 'any')
        const signer = await provider.getSigner()
        const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, signer)
        const response = await contract.proposePayout(
          recipientAddress,
          value,
          normalizedPurpose,
          normalizedMaterialHash,
          normalizedMaterialUri,
        )
        pendingHash = response.hash
        setProposalTransaction({
          status: 'pending',
          hash: pendingHash,
          message: 'Proposal submitted. Waiting for confirmation.',
        })
        const receipt = await response.wait(1, TRANSACTION_CONFIRMATION_TIMEOUT_MS)
        if (!receipt || receipt.status !== 1) {
          throw new Error('The payout proposal transaction did not complete successfully.')
        }
        setProposalTransaction({
          status: 'success',
          hash: pendingHash,
          message: 'Payout proposal confirmed. The tranche is now awaiting donor approval.',
        })
        await refresh()
      } catch (error) {
        setProposalTransaction({
          status: 'error',
          hash: pendingHash,
          message: walletErrorMessage(error),
        })
      } finally {
        setProposalSubmitting(false)
      }
    },
    [account, chainId, refresh, snapshot],
  )

  const switchLocalAccount = useCallback((nextAccount: string) => {
    if (!isLocalDemoWalletEnabled) return
    const supported = localDemoAccounts.find(
      (entry) => entry.address.toLowerCase() === nextAccount.toLowerCase(),
    )
    if (!supported) return
    window.localStorage.setItem(LOCAL_DEMO_ACCOUNT_KEY, supported.address)
    setLocalAccount(supported.address)
    setAccount(supported.address)
    setChainId(LOCAL_CHAIN_ID)
    setTransaction(EMPTY_TRANSACTION)
    setProposalTransaction(EMPTY_TRANSACTION)
    setVoteTransaction(EMPTY_TRANSACTION)
    setExecutionTransaction(EMPTY_TRANSACTION)
    setEvidenceTransaction(EMPTY_TRANSACTION)
    setWalletError('')
  }, [])

  const castVote = useCallback(
    async (inFavor: boolean) => {
      setWalletError('')
      setVoteTransaction(EMPTY_TRANSACTION)

      if (!account) {
        setWalletError('Connect a donor wallet before voting.')
        return
      }
      if (chainId !== LOCAL_CHAIN_ID) {
        setWalletError('Switch to GoodFund Localhost before voting.')
        return
      }
      if (snapshot?.phase !== 1) {
        setWalletError('Voting is only available while a payout proposal is awaiting approval.')
        return
      }
      if (!snapshot.isDonor) {
        setWalletError('Only registered donors can vote on a payout proposal.')
        return
      }
      if (snapshot.hasApproved || snapshot.hasOpposed) {
        setWalletError('This donor address has already voted on the current proposal.')
        return
      }

      setVoteSubmitting(true)
      setVoteTransaction({
        status: 'pending',
        hash: '',
        message: isLocalDemoWalletEnabled
          ? `Submitting the ${inFavor ? 'approval' : 'opposition'} vote to Anvil.`
          : `Confirm the ${inFavor ? 'approval' : 'opposition'} vote in your browser wallet.`,
      })

      let pendingHash = ''
      try {
        const provider = new BrowserProvider(injectedProvider(account), 'any')
        const signer = await provider.getSigner()
        const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, signer)
        const response = inFavor
          ? await contract.approvePayout()
          : await contract.opposePayout()
        pendingHash = response.hash
        setVoteTransaction({
          status: 'pending',
          hash: pendingHash,
          message: 'Vote submitted. Waiting for confirmation.',
        })
        const receipt = await response.wait(1, TRANSACTION_CONFIRMATION_TIMEOUT_MS)
        if (!receipt || receipt.status !== 1) {
          throw new Error('The vote transaction did not complete successfully.')
        }
        setVoteTransaction({
          status: 'success',
          hash: pendingHash,
          message: `${inFavor ? 'Approval' : 'Opposition'} vote confirmed on-chain.`,
        })
        await refresh()
      } catch (error) {
        setVoteTransaction({
          status: 'error',
          hash: pendingHash,
          message: walletErrorMessage(error),
        })
      } finally {
        setVoteSubmitting(false)
      }
    },
    [account, chainId, refresh, snapshot],
  )

  const executePayout = useCallback(async () => {
    setWalletError('')
    setExecutionTransaction(EMPTY_TRANSACTION)

    if (!account) {
      setWalletError('Connect the executor wallet before executing the payout.')
      return
    }
    if (chainId !== LOCAL_CHAIN_ID) {
      setWalletError('Switch to GoodFund Localhost before executing the payout.')
      return
    }
    if (snapshot && account.toLowerCase() !== snapshot.manager.toLowerCase()) {
      setWalletError('Only the executor manager can execute the approved payout.')
      return
    }
    if (snapshot?.phase !== 2) {
      setWalletError('The payout can only be executed after donor approval reaches Ready to disburse.')
      return
    }

    setExecutionSubmitting(true)
    setExecutionTransaction({
      status: 'pending',
      hash: '',
      message: isLocalDemoWalletEnabled
        ? 'Submitting the approved payout to Anvil.'
        : 'Confirm the payout execution in your browser wallet.',
    })

    let pendingHash = ''
    try {
      const provider = new BrowserProvider(injectedProvider(account), 'any')
      const signer = await provider.getSigner()
      const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, signer)
      const response = await contract.executePayout()
      pendingHash = response.hash
      setExecutionTransaction({
        status: 'pending',
        hash: pendingHash,
        message: 'Payout submitted. Waiting for confirmation.',
      })
      const receipt = await response.wait(1, TRANSACTION_CONFIRMATION_TIMEOUT_MS)
      if (!receipt || receipt.status !== 1) {
        throw new Error('The payout transaction did not complete successfully.')
      }
      setExecutionTransaction({
        status: 'success',
        hash: pendingHash,
        message: 'Payout executed. The tranche is now awaiting the execution report.',
      })
      await refresh()
    } catch (error) {
      setExecutionTransaction({
        status: 'error',
        hash: pendingHash,
        message: walletErrorMessage(error),
      })
    } finally {
      setExecutionSubmitting(false)
    }
  }, [account, chainId, refresh, snapshot])

  const confirmExecution = useCallback(async (evidenceHash: string, evidenceUri: string) => {
    setWalletError('')
    setEvidenceTransaction(EMPTY_TRANSACTION)

    if (!account) {
      setWalletError('Connect the executor wallet before confirming execution.')
      return
    }
    if (chainId !== LOCAL_CHAIN_ID) {
      setWalletError('Switch to GoodFund Localhost before confirming execution.')
      return
    }
    if (snapshot && account.toLowerCase() !== snapshot.manager.toLowerCase()) {
      setWalletError('Only the executor manager can confirm the execution report.')
      return
    }
    if (snapshot?.phase !== 3) {
      setWalletError('Execution evidence can only be submitted after a payout has been executed.')
      return
    }

    const normalizedHash = evidenceHash.trim().toLowerCase()
    const normalizedUri = evidenceUri.trim()
    if (!/^0x[0-9a-f]{64}$/.test(normalizedHash) || normalizedHash === ZeroHash) {
      setEvidenceTransaction({
        status: 'error',
        hash: '',
        message: 'Verify a non-empty SHA-256 evidence hash before confirming execution.',
      })
      return
    }
    if (!normalizedUri) {
      setEvidenceTransaction({
        status: 'error',
        hash: '',
        message: 'Choose or verify an execution evidence file before continuing.',
      })
      return
    }
    if (normalizedUri.length > 512) {
      setEvidenceTransaction({
        status: 'error',
        hash: '',
        message: 'The execution evidence address is too long.',
      })
      return
    }

    setEvidenceSubmitting(true)
    setEvidenceTransaction({
      status: 'pending',
      hash: '',
      message: isLocalDemoWalletEnabled
        ? 'Submitting the execution evidence to Anvil.'
        : 'Confirm the execution evidence in your browser wallet.',
    })

    let pendingHash = ''
    try {
      const provider = new BrowserProvider(injectedProvider(account), 'any')
      const signer = await provider.getSigner()
      const contract = new Contract(WELFARE_FUND_ADDRESS, welfareFundAbi, signer)
      const response = await contract.confirmExecution(normalizedHash, normalizedUri)
      pendingHash = response.hash
      setEvidenceTransaction({
        status: 'pending',
        hash: pendingHash,
        message: 'Execution evidence submitted. Waiting for confirmation.',
      })
      const receipt = await response.wait(1, TRANSACTION_CONFIRMATION_TIMEOUT_MS)
      if (!receipt || receipt.status !== 1) {
        throw new Error('The execution evidence transaction did not complete successfully.')
      }
      const completedTranche = snapshot?.currentTranche
      setEvidenceTransaction({
        status: 'success',
        hash: pendingHash,
        message: completedTranche
          ? `Execution evidence confirmed. Tranche ${completedTranche} is complete and tranche ${completedTranche + 1} is open.`
          : 'Execution evidence confirmed. The next tranche is open.',
      })
      await refresh()
    } catch (error) {
      setEvidenceTransaction({
        status: 'error',
        hash: pendingHash,
        message: walletErrorMessage(error),
      })
    } finally {
      setEvidenceSubmitting(false)
    }
  }, [account, chainId, refresh, snapshot])

  return {
    account,
    chainId,
    isCorrectNetwork: chainId === LOCAL_CHAIN_ID,
    snapshot,
    snapshotError,
    walletError,
    connecting,
    switchingNetwork,
    submitting,
    transaction,
    proposalSubmitting,
    proposalTransaction,
    voteSubmitting,
    voteTransaction,
    executionSubmitting,
    executionTransaction,
    evidenceSubmitting,
    evidenceTransaction,
    isLocalDemoWallet: isLocalDemoWalletEnabled,
    isManager: Boolean(
      account && snapshot?.manager
      && account.toLowerCase() === snapshot.manager.toLowerCase(),
    ),
    localDemoAccounts,
    localAccount,
    connect,
    switchToLocalhost,
    switchLocalAccount,
    donate,
    proposePayout,
    castVote,
    executePayout,
    confirmExecution,
    refresh,
    clearTransaction,
  }
}

export type LocalChainFund = ReturnType<typeof useLocalChainFund>
