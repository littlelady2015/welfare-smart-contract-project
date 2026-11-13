import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Select, Statistic, Tag, Upload } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleOutlined,
  CheckOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
  SendOutlined,
  SwapOutlined,
  StopOutlined,
  UploadOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import {
  DEMO_USD_PER_ETH,
  LOCAL_CHAIN_ID,
  WELFARE_FUND_ADDRESS,
  demoEthFromUsd,
  formatUsdFromEth,
  phaseLabel,
  shortAddress,
  walletLabel,
  type LocalChainFund,
} from './chain'
import {
  approvalMaterialBlob,
  approvalMaterialHref,
  saveLocalApprovalMaterial,
} from './approvalMaterialStore'

const DEMO_PROJECT_NAME = 'Mountain School Water Access'
const DEMO_PROJECT_ID = 'PF-2025-018'

export function WalletDonationPanel({ wallet }: { wallet: LocalChainFund }) {
  const [donationUsd, setDonationUsd] = useState('1000')
  const [proposalRecipient, setProposalRecipient] = useState(
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  )
  const [proposalUsd, setProposalUsd] = useState('800')
  const [proposalPurpose, setProposalPurpose] = useState(
    'Procurement of water filtration equipment for three schools',
  )
  const [approvalMaterialName, setApprovalMaterialName] = useState('')
  const [approvalMaterialHash, setApprovalMaterialHash] = useState('')
  const [approvalMaterialUri, setApprovalMaterialUri] = useState('')
  const [approvalMaterialLoading, setApprovalMaterialLoading] = useState(false)
  const [approvalMaterialError, setApprovalMaterialError] = useState('')
  const [evidenceFileName, setEvidenceFileName] = useState('')
  const [evidenceHash, setEvidenceHash] = useState('')
  const [evidenceVerifying, setEvidenceVerifying] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')
  const [materialVerification, setMaterialVerification] = useState<'idle' | 'verified' | 'mismatch' | 'error'>('idle')
  const donationEth = demoEthFromUsd(donationUsd)
  const proposalEth = demoEthFromUsd(proposalUsd)
  const proposalApprovalMaterialHref = approvalMaterialHref(wallet.snapshot?.proposedApprovalMaterialUri ?? '')
  const canDonate = Boolean(wallet.account)
    && wallet.isCorrectNetwork
    && wallet.snapshot?.phase === 0
    && Boolean(donationEth)
    && !wallet.submitting
  const transaction = wallet.transaction
  const proposalTransaction = wallet.proposalTransaction
  const voteTransaction = wallet.voteTransaction
  const executionTransaction = wallet.executionTransaction
  const evidenceTransaction = wallet.evidenceTransaction
  const proposalActive = wallet.snapshot ? wallet.snapshot.phase !== 0 : false
  const hasActiveProposal = Boolean(wallet.snapshot?.hasActiveProposal)
  const hasRecordedEvidence = Boolean(
    wallet.snapshot
    && wallet.snapshot.lastExecutionEvidenceHash !== `0x${'0'.repeat(64)}`,
  )
  const showDonationForm = !wallet.account || Boolean(wallet.snapshot && !wallet.isManager)
  const donorCount = wallet.snapshot?.donorCount ?? 0
  const approvals = wallet.snapshot?.approvals ?? 0
  const oppositions = wallet.snapshot?.oppositions ?? 0
  const approvalPercent = donorCount > 0 ? (approvals / donorCount) * 100 : 0
  const oppositionPercent = donorCount > 0 ? (oppositions / donorCount) * 100 : 0
  const approvalThresholdMet = donorCount > 0 && approvals * 100 > donorCount * 50
  const oppositionThresholdMet = donorCount > 0 && oppositions * 100 < donorCount * 30
  const hasVoted = Boolean(wallet.snapshot?.hasApproved || wallet.snapshot?.hasOpposed)
  const canVote = Boolean(wallet.account)
    && wallet.isCorrectNetwork
    && wallet.snapshot?.phase === 1
    && wallet.snapshot?.isDonor
    && !hasVoted
    && !wallet.voteSubmitting

  const transactionType = transaction.status === 'success'
    ? 'success'
    : transaction.status === 'error'
      ? 'error'
      : 'info'

  const transactionIcon = transaction.status === 'success'
    ? <CheckCircleFilled />
    : transaction.status === 'error'
      ? <CloseCircleOutlined />
      : <LoadingOutlined />

  useEffect(() => {
    setMaterialVerification('idle')
  }, [wallet.snapshot?.currentProposalId, wallet.snapshot?.proposedApprovalMaterialHash])

  async function sha256Blob(blob: Blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    return `0x${Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read the approval material.'))
      reader.readAsDataURL(blob)
    })
  }

  async function useSampleApprovalMaterial() {
    setApprovalMaterialLoading(true)
    setApprovalMaterialError('')
    try {
      const uri = '/evidence/procurement-quotation.svg'
      const response = await fetch(uri, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load the sample approval material.')
      const blob = await response.blob()
      setApprovalMaterialHash(await sha256Blob(blob))
      setApprovalMaterialName('procurement-quotation.svg')
      setApprovalMaterialUri(uri)
    } catch (error) {
      setApprovalMaterialError(error instanceof Error ? error.message : 'Unable to load the approval material.')
    } finally {
      setApprovalMaterialLoading(false)
    }
  }

  async function useLocalApprovalMaterial(file: File) {
    setApprovalMaterialLoading(true)
    setApprovalMaterialError('')
    try {
      if (file.size > 750_000) {
        throw new Error('For this local demo, approval material files must be 750 KB or smaller.')
      }
      const hash = await sha256Blob(file)
      const dataUrl = await blobToDataUrl(file)
      const uri = saveLocalApprovalMaterial({
        hash,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
      })
      setApprovalMaterialHash(hash)
      setApprovalMaterialName(file.name)
      setApprovalMaterialUri(uri)
    } catch (error) {
      setApprovalMaterialError(error instanceof Error ? error.message : 'Unable to prepare the approval material.')
    } finally {
      setApprovalMaterialLoading(false)
    }
  }

  async function verifyProposalApprovalMaterial() {
    if (!wallet.snapshot?.proposedApprovalMaterialUri) return
    setMaterialVerification('idle')
    try {
      const blob = await approvalMaterialBlob(wallet.snapshot.proposedApprovalMaterialUri)
      const actualHash = await sha256Blob(blob)
      setMaterialVerification(
        actualHash.toLowerCase() === wallet.snapshot.proposedApprovalMaterialHash.toLowerCase()
          ? 'verified'
          : 'mismatch',
      )
    } catch {
      setMaterialVerification('error')
    }
  }

  async function hashEvidence(blob: Blob, fileName: string) {
    setEvidenceVerifying(true)
    setEvidenceError('')
    try {
      setEvidenceHash(await sha256Blob(blob))
      setEvidenceFileName(fileName)
    } catch (error) {
      setEvidenceHash('')
      setEvidenceFileName('')
      setEvidenceError(error instanceof Error ? error.message : 'Unable to calculate the file hash.')
    } finally {
      setEvidenceVerifying(false)
    }
  }

  async function verifySampleEvidence() {
    setEvidenceVerifying(true)
    setEvidenceError('')
    try {
      const response = await fetch('/evidence/water-source-assessment.svg', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load the sample evidence file.')
      await hashEvidence(await response.blob(), 'water-source-assessment.svg')
    } catch (error) {
      setEvidenceVerifying(false)
      setEvidenceError(error instanceof Error ? error.message : 'Unable to verify the sample evidence.')
    }
  }

  return (
    <Card className="live-demo-card" variant="outlined">
      <div className="live-demo-heading">
        <div>
          <p className="eyebrow">LOCAL CHAIN · DEMO PROJECT · {DEMO_PROJECT_ID}</p>
          <h2>{DEMO_PROJECT_NAME}</h2>
          <p>
            Clean water infrastructure for three rural schools.
            {' '}
            {wallet.isLocalDemoWallet
              ? 'Use the unlocked Anvil demo accounts to submit real local-chain transactions.'
              : 'Connect your browser wallet and confirm transactions with the account acting for your role.'}
            {' '}Amounts use a fixed USD display rate; the contract still settles in test ETH.
            {' '}This MVP is intentionally limited to this single demonstration project.
          </p>
        </div>
        <div className="live-network">
          <Tag color="purple">Demo Project</Tag>
          <Tag color="blue">Demo rate · 1 ETH = ${DEMO_USD_PER_ETH.toLocaleString('en-US')}</Tag>
          <Tag color={wallet.isCorrectNetwork ? 'success' : 'warning'}>
            {wallet.chainId === null ? 'Network unknown' : `Chain ${wallet.chainId}`}
          </Tag>
          <Tag color={wallet.snapshot?.phase === 0 ? 'green' : 'gold'}>
            {phaseLabel(wallet.snapshot?.phase)}
          </Tag>
        </div>
      </div>

      <section className="live-metrics" aria-label="Live contract snapshot">
        <div>
          <span>Contract balance</span>
          <Statistic value={formatUsdFromEth(wallet.snapshot?.balanceEth)} />
          <small className="live-metric-chain-value">{wallet.snapshot?.balanceEth ?? '—'} test ETH on chain</small>
        </div>
        <div>
          <span>Total received</span>
          <Statistic value={formatUsdFromEth(wallet.snapshot?.totalReceivedEth)} />
          <small className="live-metric-chain-value">{wallet.snapshot?.totalReceivedEth ?? '—'} test ETH on chain</small>
        </div>
        <div>
          <span>Registered donors</span>
          <Statistic value={wallet.snapshot?.donorCount ?? '—'} />
        </div>
        <div>
          <span>Current tranche</span>
          <Statistic value={wallet.snapshot?.currentTranche ?? '—'} />
        </div>
      </section>

      <div className={`live-demo-grid ${wallet.isManager ? 'is-manager-view' : ''}`}>
        <section className="wallet-connection">
          <div className="live-section-title">
            <span className="live-section-icon"><WalletOutlined /></span>
            <div>
              <h3>Wallet connection</h3>
              <p>
                {wallet.isLocalDemoWallet
                  ? 'The selected local Anvil account signs through the local RPC.'
                  : 'Your connected browser wallet determines which address signs the transaction.'}
              </p>
            </div>
            {wallet.account && (
              <Tag color={wallet.isCorrectNetwork ? 'success' : 'warning'}>
                {wallet.isCorrectNetwork ? 'Local network' : 'Wrong network'}
              </Tag>
            )}
          </div>

          {!wallet.account ? (
            <div className="wallet-connect-state">
              <p>
                {wallet.isLocalDemoWallet
                  ? 'Use the local Anvil demo wallet to donate and register a donor address.'
                  : 'Connect a browser wallet to donate and register as a donor address.'}
              </p>
              <Button
                type="primary"
                className="live-primary-button"
                icon={<WalletOutlined />}
                loading={wallet.connecting}
                onClick={() => void wallet.connect()}
              >
                {wallet.isLocalDemoWallet ? 'Use Local Demo Wallet' : 'Connect Wallet'}
              </Button>
            </div>
          ) : (
            <>
              <div className="connected-wallet">
                <span className="wallet-avatar"><WalletOutlined /></span>
                <div>
                  <strong>{walletLabel(wallet.account)}</strong>
                  <code title={wallet.account}>{wallet.account}</code>
                </div>
                <div className="wallet-tags">
                  {wallet.isManager ? (
                    <Tag color="purple">Project manager</Tag>
                  ) : (
                    <Tag color={wallet.snapshot?.isDonor ? 'success' : 'default'}>
                      {wallet.snapshot?.isDonor ? 'Registered donor' : 'Connected wallet'}
                    </Tag>
                  )}
                </div>
              </div>

              {wallet.isLocalDemoWallet && (
                <div className="local-wallet-control">
                  <div>
                    <strong>Local Anvil account</strong>
                    <span>Switch the signing account used by the real local-chain transaction.</span>
                  </div>
                  <Select
                    aria-label="Select local Anvil account"
                    value={wallet.account}
                    onChange={(value) => wallet.switchLocalAccount(value)}
                    options={wallet.localDemoAccounts.map((entry) => ({
                      value: entry.address,
                      label: `${entry.label} · ${shortAddress(entry.address)}`,
                    }))}
                  />
                </div>
              )}

              {!wallet.isLocalDemoWallet && !wallet.isCorrectNetwork && (
                <Alert
                  className="live-wallet-alert"
                  type="warning"
                  showIcon
                  message={`Switch your browser wallet to GoodFund Localhost (${LOCAL_CHAIN_ID}) before donating.`}
                  action={(
                    <Button
                      size="small"
                      icon={<SwapOutlined />}
                      loading={wallet.switchingNetwork}
                      onClick={() => void wallet.switchToLocalhost()}
                    >
                      Switch network
                    </Button>
                  )}
                />
              )}
            </>
          )}

          {wallet.walletError && (
            <Alert className="live-wallet-alert" type="error" showIcon message={wallet.walletError} />
          )}

          <div className="wallet-contract-meta">
            <div>
              <span>Contract</span>
              <code title={WELFARE_FUND_ADDRESS}>{shortAddress(WELFARE_FUND_ADDRESS)}</code>
            </div>
            <div>
              <span>Manager</span>
              <code title={wallet.snapshot?.manager}>{shortAddress(wallet.snapshot?.manager)}</code>
            </div>
            <Button
              type="text"
              className="live-refresh-button"
              icon={<ReloadOutlined />}
              onClick={() => void wallet.refresh()}
            >
              Refresh
            </Button>
          </div>
        </section>

        {showDonationForm && <section className="donation-form">
          <div className="live-section-title">
            <span className="live-section-icon"><SendOutlined /></span>
            <div>
              <h3>Donate in USD</h3>
              <p>Choose a dollar amount; the wallet sends the equivalent test ETH at the demo rate.</p>
            </div>
          </div>

          <label htmlFor="donation-amount">Donation amount (USD)</label>
          <div className="donation-input-wrap">
            <Input
              id="donation-amount"
              className="donation-input"
              inputMode="decimal"
              value={donationUsd}
              onChange={(event) => setDonationUsd(event.target.value)}
            />
            <span>USD</span>
          </div>
          <div className="donation-hint">
            <span>{donationEth ? `Settles as ${donationEth} test ETH` : 'Enter a positive USD amount'}</span>
            <span>One address is counted once</span>
          </div>
          <Button
            type="primary"
            className="live-primary-button donation-submit"
            icon={wallet.submitting ? <LoadingOutlined /> : <SendOutlined />}
            disabled={!canDonate}
            loading={wallet.submitting}
            onClick={() => void wallet.donate(donationEth)}
          >
            {!wallet.account
              ? 'Connect wallet to donate'
              : proposalActive
                ? 'Donations paused for approval'
                : `Donate $${donationUsd || '0'}`}
          </Button>

          {(!wallet.account || proposalActive) && (
            <p className="live-form-note">
              {proposalActive
                ? 'Donations resume only after the active proposal is rejected or the tranche execution report is confirmed.'
                : wallet.isLocalDemoWallet
                ? 'Choose an unlocked Anvil account, then submit a real local-chain donation.'
                : 'Connect each donor address from its own wallet session.'}
            </p>
          )}
        </section>}
      </div>

      {wallet.account && wallet.isManager && (
        <section className="executor-proposal-panel" aria-label="Executor proposal controls">
          <div className="live-section-title">
            <span className="live-section-icon"><SafetyCertificateOutlined /></span>
            <div>
              <h3>Executor controls</h3>
              <p>Only the contract manager can propose how the funded tranche will be released.</p>
            </div>
            <Tag color={proposalActive ? 'gold' : 'purple'}>
              {proposalActive ? phaseLabel(wallet.snapshot?.phase) : 'Manager only'}
            </Tag>
          </div>

          <div className="proposal-form-grid">
            <label>
              Recipient address
              <Input
                aria-label="Proposal recipient address"
                value={proposalRecipient}
                onChange={(event) => setProposalRecipient(event.target.value)}
                disabled={proposalActive}
              />
            </label>
            <label>
              Tranche amount (USD)
              <div className="donation-input-wrap">
                <Input
                  aria-label="Proposal amount"
                  inputMode="decimal"
                  value={proposalUsd}
                  onChange={(event) => setProposalUsd(event.target.value)}
                  disabled={proposalActive}
                />
                <span>USD</span>
              </div>
            </label>
          </div>
          <p className="proposal-rate-note">
            {proposalEth ? `Settles as ${proposalEth} test ETH at the demo rate.` : 'Enter a positive USD amount.'}
          </p>
          <label className="proposal-purpose-field">
            Purpose of this payout
            <Input.TextArea
              aria-label="Proposal purpose"
              value={proposalPurpose}
              onChange={(event) => setProposalPurpose(event.target.value)}
              disabled={proposalActive}
              maxLength={280}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
          <div className="approval-material-control">
            <div>
              <strong>Approval material</strong>
              <span>Donors can inspect this before voting. The contract stores its SHA-256 hash and access identifier.</span>
            </div>
            <div className="approval-material-actions">
              <Button loading={approvalMaterialLoading} disabled={proposalActive} onClick={() => void useSampleApprovalMaterial()}>
                Use sample approval pack
              </Button>
              <Upload
                accept=".pdf,.png,.jpg,.jpeg,.svg,.txt"
                showUploadList={false}
                disabled={proposalActive}
                beforeUpload={(file) => {
                  void useLocalApprovalMaterial(file)
                  return false
                }}
              >
                <Button disabled={proposalActive}>Choose approval file</Button>
              </Upload>
            </div>
          </div>
          {approvalMaterialError && <Alert type="error" showIcon message={approvalMaterialError} />}
          {approvalMaterialHash && (
            <div className="approval-material-ready">
              <span><CheckCircleFilled /> {approvalMaterialName}</span>
              <code>{approvalMaterialHash}</code>
            </div>
          )}
          <Button
            type="primary"
            className="live-primary-button proposal-submit"
            icon={wallet.proposalSubmitting ? <LoadingOutlined /> : <SafetyCertificateOutlined />}
            disabled={proposalActive || !proposalEth || !proposalPurpose.trim() || !approvalMaterialHash || !approvalMaterialUri}
            loading={wallet.proposalSubmitting}
            onClick={() => void wallet.proposePayout(
              proposalRecipient,
              proposalEth,
              proposalPurpose,
              approvalMaterialHash,
              approvalMaterialUri,
            )}
          >
            {wallet.snapshot?.phase === 3
              ? 'Submit evidence before next proposal'
              : proposalActive
                ? 'Proposal already active'
                : `Propose $${proposalUsd || '0'} payout`}
          </Button>
          {wallet.snapshot?.phase === 3 && (
            <p className="execution-note">
              The next payout proposal unlocks after the execution evidence is confirmed.
            </p>
          )}
        </section>
      )}

      {wallet.snapshot && hasActiveProposal && (
        <section className="proposal-status" aria-label="Current payout proposal">
          <div>
            <span>Current proposal</span>
            <strong>#{wallet.snapshot.currentProposalId} · {phaseLabel(wallet.snapshot.phase)}</strong>
          </div>
          <div>
            <span>Recipient</span>
            <code title={wallet.snapshot.proposedRecipient}>
              {shortAddress(wallet.snapshot.proposedRecipient)}
            </code>
          </div>
          <div>
            <span>Amount</span>
            <strong>
              {formatUsdFromEth(wallet.snapshot.proposedAmountEth)}
              <small className="proposal-chain-amount">{wallet.snapshot.proposedAmountEth} test ETH</small>
            </strong>
          </div>
          <div>
            <span>Recipient balance</span>
            <strong>
              {formatUsdFromEth(wallet.snapshot.recipientBalanceEth)}
              <small className="proposal-chain-amount">{wallet.snapshot.recipientBalanceEth} test ETH</small>
            </strong>
          </div>
          <div>
            <span>Votes</span>
            <strong>
              {wallet.snapshot.approvals} yes · {wallet.snapshot.oppositions} no
            </strong>
          </div>
        </section>
      )}

      {wallet.snapshot && hasActiveProposal && wallet.snapshot.proposedPurpose && (
        <section className="proposal-material-panel" aria-label="Payout approval material">
          <div className="proposal-material-copy">
            <div className="live-section-title">
              <span className="live-section-icon"><FileSearchOutlined /></span>
              <div>
                <h3>Payout approval material</h3>
                <p>{wallet.snapshot.proposedPurpose}</p>
              </div>
              <Tag color="purple">Review before voting</Tag>
            </div>
            <div className="proposal-material-hash">
              <span>On-chain SHA-256</span>
              <code>{wallet.snapshot.proposedApprovalMaterialHash}</code>
            </div>
          </div>
          <div className="proposal-material-actions">
            <Button
              href={proposalApprovalMaterialHref || undefined}
              target="_blank"
              rel="noreferrer"
              disabled={!proposalApprovalMaterialHref}
            >
              Open approval material
            </Button>
            <Button onClick={() => void verifyProposalApprovalMaterial()}>
              Verify file hash
            </Button>
          </div>
          {!proposalApprovalMaterialHref && (
            <Alert
              className="proposal-material-alert"
              type="warning"
              showIcon
              message="This locally uploaded material is not available in this browser profile."
            />
          )}
          {materialVerification === 'verified' && (
            <Alert className="proposal-material-alert" type="success" showIcon message="Verified: the material matches the on-chain hash." />
          )}
          {materialVerification === 'mismatch' && (
            <Alert className="proposal-material-alert" type="error" showIcon message="Mismatch: the material does not match the on-chain hash." />
          )}
          {materialVerification === 'error' && (
            <Alert className="proposal-material-alert" type="error" showIcon message="The approval material could not be loaded or verified." />
          )}
        </section>
      )}

      {wallet.account && wallet.isManager && wallet.snapshot && hasActiveProposal && (
        <section className="payout-execution-panel" aria-label="Executor payout">
          <div className="live-section-title">
            <span className="live-section-icon"><SendOutlined /></span>
            <div>
              <h3>Executor payout</h3>
              <p>Release the approved amount to the fixed recipient encoded in the proposal.</p>
            </div>
            <Tag color={wallet.snapshot.phase === 2 ? 'success' : 'default'}>
              {phaseLabel(wallet.snapshot.phase)}
            </Tag>
          </div>
          <Button
            type="primary"
            className="live-primary-button payout-execute"
            icon={wallet.executionSubmitting ? <LoadingOutlined /> : <SendOutlined />}
            disabled={wallet.snapshot.phase !== 2}
            loading={wallet.executionSubmitting}
            onClick={() => void wallet.executePayout()}
          >
            {wallet.snapshot.phase === 2 ? 'Execute payout' : 'Payout not executable yet'}
          </Button>
          {wallet.snapshot.phase === 3 && (
            <p className="execution-note">
              Payout completed. Submit execution evidence before opening the next tranche.
            </p>
          )}
        </section>
      )}

      {wallet.account && wallet.isManager && wallet.snapshot?.phase === 3 && (
        <section className="evidence-submit-panel" aria-label="Execution evidence">
          <div className="live-section-title">
            <span className="live-section-icon"><FileSearchOutlined /></span>
            <div>
              <h3>Execution evidence</h3>
              <p>Verify the evidence file hash before opening the next tranche.</p>
            </div>
            <Tag color="gold">Evidence required</Tag>
          </div>

          <div className="evidence-actions">
            <Button
              icon={<FileSearchOutlined />}
              loading={evidenceVerifying}
              onClick={() => void verifySampleEvidence()}
            >
              Verify sample file
            </Button>
            <Upload
              accept=".pdf,.png,.jpg,.jpeg,.svg,.txt"
              showUploadList={false}
              beforeUpload={(file) => {
                void hashEvidence(file, file.name)
                return false
              }}
            >
              <Button icon={<UploadOutlined />}>Choose evidence file</Button>
            </Upload>
          </div>

          {evidenceError && <Alert type="error" showIcon message={evidenceError} />}

          {evidenceHash && (
            <div className="evidence-hash-result">
              <div>
                <span>Verified file</span>
                <strong>{evidenceFileName}</strong>
              </div>
              <div>
                <span>SHA-256</span>
                <code>{evidenceHash}</code>
              </div>
            </div>
          )}

          <Button
            type="primary"
            className="live-primary-button evidence-confirm"
            icon={wallet.evidenceSubmitting ? <LoadingOutlined /> : <CheckCircleFilled />}
            disabled={!evidenceHash || evidenceVerifying}
            loading={wallet.evidenceSubmitting}
            onClick={() => void wallet.confirmExecution(evidenceHash)}
          >
            {wallet.snapshot
              ? `Confirm execution & open tranche ${wallet.snapshot.currentTranche + 1}`
              : 'Confirm execution & open next tranche'}
          </Button>
        </section>
      )}

      {hasRecordedEvidence && wallet.snapshot?.phase === 0 && (
        <section className="evidence-confirmed-panel" aria-label="Confirmed execution evidence">
          <div>
            <span>Latest execution evidence</span>
            <code>{wallet.snapshot.lastExecutionEvidenceHash}</code>
          </div>
          <Tag color="success">Tranche {wallet.snapshot.currentTranche} open</Tag>
        </section>
      )}

      {wallet.snapshot
        && (wallet.snapshot.phase === 1 || wallet.snapshot.phase === 2)
        && wallet.snapshot.currentProposalId > 0 && (
        <section className="donor-vote-panel" aria-label="Donor voting">
          <div className="live-section-title">
            <span className="live-section-icon"><CheckCircleFilled /></span>
            <div>
              <h3>Donor vote</h3>
              <p>Registered donor addresses vote once on the active payout proposal.</p>
            </div>
            <Tag color="gold">{phaseLabel(wallet.snapshot.phase)}</Tag>
          </div>

          <div className="vote-thresholds">
            <div className={approvalThresholdMet ? 'is-met' : ''}>
              <span>Approvals must exceed 50%</span>
              <strong>{approvalPercent.toFixed(0)}%</strong>
            </div>
            <div className={oppositionThresholdMet ? 'is-met' : 'is-blocked'}>
              <span>Opposition must stay below 30%</span>
              <strong>{oppositionPercent.toFixed(0)}%</strong>
            </div>
          </div>

          <div className="vote-actions">
            <div>
              {wallet.snapshot.phase === 2 && (
                <span>Voting is closed. The proposal has reached Ready to disburse.</span>
              )}
              {wallet.snapshot.phase !== 2 && !wallet.snapshot.isDonor && (
                <span>Only Donor A and Donor B can vote on this proposal.</span>
              )}
              {wallet.snapshot.phase !== 2 && wallet.snapshot.isDonor && hasVoted && (
                <span>
                  This address already voted {wallet.snapshot.hasApproved ? 'yes' : 'no'}.
                </span>
              )}
              {wallet.snapshot.phase !== 2 && wallet.snapshot.isDonor && !hasVoted && (
                <span>Choose one vote. It cannot be changed for this proposal.</span>
              )}
            </div>
            <div className="vote-buttons">
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={!canVote}
                loading={wallet.voteSubmitting}
                onClick={() => void wallet.castVote(true)}
              >
                Approve
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                disabled={!canVote}
                loading={wallet.voteSubmitting}
                onClick={() => void wallet.castVote(false)}
              >
                Oppose
              </Button>
            </div>
          </div>
        </section>
      )}

      {transaction.status !== 'idle' && (
        <Alert
          className={`transaction-alert transaction-${transaction.status}`}
          type={transactionType}
          showIcon
          icon={transactionIcon}
          message={transaction.message}
          description={transaction.hash ? (
            <span className="transaction-hash">
              Transaction hash
              <code>{transaction.hash}</code>
            </span>
          ) : undefined}
        />
      )}

      {proposalTransaction.status !== 'idle' && (
        <Alert
          className={`transaction-alert transaction-${proposalTransaction.status}`}
          type={proposalTransaction.status === 'success'
            ? 'success'
            : proposalTransaction.status === 'error'
              ? 'error'
              : 'info'}
          showIcon
          message={proposalTransaction.message}
          description={proposalTransaction.hash ? (
            <span className="transaction-hash">
              Transaction hash
              <code>{proposalTransaction.hash}</code>
            </span>
          ) : undefined}
        />
      )}

      {voteTransaction.status !== 'idle' && (
        <Alert
          className={`transaction-alert transaction-${voteTransaction.status}`}
          type={voteTransaction.status === 'success'
            ? 'success'
            : voteTransaction.status === 'error'
              ? 'error'
              : 'info'}
          showIcon
          message={voteTransaction.message}
          description={voteTransaction.hash ? (
            <span className="transaction-hash">
              Transaction hash
              <code>{voteTransaction.hash}</code>
            </span>
          ) : undefined}
        />
      )}

      {executionTransaction.status !== 'idle' && (
        <Alert
          className={`transaction-alert transaction-${executionTransaction.status}`}
          type={executionTransaction.status === 'success'
            ? 'success'
            : executionTransaction.status === 'error'
              ? 'error'
              : 'info'}
          showIcon
          message={executionTransaction.message}
          description={executionTransaction.hash ? (
            <span className="transaction-hash">
              Transaction hash
              <code>{executionTransaction.hash}</code>
            </span>
          ) : undefined}
        />
      )}

      {evidenceTransaction.status !== 'idle' && (
        <Alert
          className={`transaction-alert transaction-${evidenceTransaction.status}`}
          type={evidenceTransaction.status === 'success'
            ? 'success'
            : evidenceTransaction.status === 'error'
              ? 'error'
              : 'info'}
          showIcon
          message={evidenceTransaction.message}
          description={evidenceTransaction.hash ? (
            <span className="transaction-hash">
              Transaction hash
              <code>{evidenceTransaction.hash}</code>
            </span>
          ) : undefined}
        />
      )}

      {wallet.snapshotError && (
        <Alert
          className="live-wallet-alert"
          type="error"
          showIcon
          message="Unable to read the local contract"
          description={wallet.snapshotError}
        />
      )}

      <p className="live-demo-note">
        {wallet.isLocalDemoWallet
          ? 'The demo account selector in the sidebar controls only the prototype screens. Contract values above come from the selected local signer and Anvil.'
          : 'Each participant should connect their own browser wallet. USD values use the fixed demo rate; role visibility, balances, and transactions come from the connected address and Anvil.'}
      </p>
    </Card>
  )
}
