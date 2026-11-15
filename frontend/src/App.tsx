import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Modal, notification, Progress, Statistic, Steps, Tag } from 'antd'
import {
  ArrowRightOutlined,
  AuditOutlined,
  BankOutlined,
  BellOutlined,
  CheckCircleFilled,
  CloseOutlined,
  EyeOutlined,
  LockOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  decideNotification,
  getDonors,
  getNotifications,
  initializeDonorDatabase,
  notifyDonors as sendDonorNotifications,
  type DonorDecision,
  type DonorNotification,
  type DonorRecord,
} from './donorStore'
import {
  formatUsdFromEth,
  phaseLabel,
  shortAddress,
  useLocalChainFund,
  WELFARE_FUND_ADDRESS,
  walletLabel,
  type ChainSnapshot,
} from './chain'
import { materialHref } from './approvalMaterialStore'
import { WalletDonationPanel } from './WalletDonationPanel'

type Workspace = 'donors' | 'projects' | 'approval-flow' | 'contract'
type Vote = 'approve' | 'oppose' | null
type AccountRole = 'admin' | 'largest-donor'

const CURRENT_PROPOSAL_ID = 'PF-2025-018-T02'

const navigation: { id: Workspace; label: string; count: string; icon: React.ReactNode }[] = [
  { id: 'donors', label: 'Donors', count: '', icon: <TeamOutlined /> },
  { id: 'projects', label: 'Funding Projects', count: '03', icon: <ProjectOutlined /> },
  { id: 'approval-flow', label: 'Approval Flow', count: '02', icon: <AuditOutlined /> },
  { id: 'contract', label: 'Fund Contract', count: '', icon: <BankOutlined /> },
]

const workspaceCopy: Record<Workspace, { eyebrow: string; title: string; description: string }> = {
  donors: {
    eyebrow: 'PEOPLE & APPROVALS',
    title: 'Donors',
    description: 'Review each donor and their decision on every funding item.',
  },
  projects: {
    eyebrow: 'PORTFOLIO',
    title: 'Funding project',
    description: 'Track project funding, milestones, and donor communications.',
  },
  'approval-flow': {
    eyebrow: 'RELEASE GATE · CURRENT TRANCHE',
    title: 'Approval flow',
    description: 'A tranche advances only when both shareholder vote thresholds are met.',
  },
  contract: {
    eyebrow: 'ON-CHAIN TREASURY',
    title: 'Fund contract',
    description: 'Review the contract that holds project funds and enforces release rules.',
  },
}

const releaseRules = [
  {
    title: 'More than 50% approval',
    description: 'Approvals are counted per registered donor address. More than half of all registered donors must vote in favor of the exact tranche proposal.',
  },
  {
    title: 'Less than 30% opposition',
    description: 'Opposing votes must remain below 30% of all registered donor addresses. At 30% or above, the proposal is rejected and cannot be released.',
  },
  {
    title: 'Evidence before the next tranche',
    description: 'After a release is sent, the project manager must submit the execution evidence hash. Only then can another tranche be proposed.',
  },
]

const completedWork = [
  {
    title: 'Water source assessment completed',
    description: 'Water points at three rural schools were inspected. Samples were collected and the required filtration capacity was documented.',
    image: '/evidence/water-source-assessment.svg',
    imageAlt: 'Illustration of a school water point assessment',
    imageLabel: 'School water point assessment · Sample illustration',
  },
  {
    title: 'Installation sites prepared',
    description: 'Three installation locations were confirmed with school staff, including inlet access, drainage, and safe equipment placement.',
    image: '/evidence/school-site-readiness.svg',
    imageAlt: 'Illustration of a school prepared for water filtration equipment',
    imageLabel: 'School installation site · Sample illustration',
  },
]

const proposedExpenses = [
  { item: 'Water filtration systems', detail: '3 units × $4,200', amount: 12600 },
  { item: 'Replacement cartridges and fittings', detail: 'Cartridge sets, tubing, and connectors', amount: 2400 },
  { item: 'Delivery and equipment insurance', detail: 'Delivery to three rural school sites', amount: 1100 },
  { item: 'Installation and commissioning', detail: 'Technician labor and water-flow testing', amount: 2500 },
]

function App() {
  const wallet = useLocalChainFund()
  const isProductMode = !wallet.isLocalDemoWallet
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>('projects')
  const [accountRole, setAccountRole] = useState<AccountRole>('admin')
  const [selectedAccountRole, setSelectedAccountRole] = useState<AccountRole>('largest-donor')
  const [accountLoginOpen, setAccountLoginOpen] = useState(false)
  const [donors, setDonors] = useState<DonorRecord[]>([])
  const [notifications, setNotifications] = useState<DonorNotification[]>([])
  const [databaseReady, setDatabaseReady] = useState(false)
  const [databaseError, setDatabaseError] = useState('')
  const [toast, setToast] = useState('')
  const [notificationApi, notificationContextHolder] = notification.useNotification()
  const largestDonor = donors.reduce<DonorRecord | null>(
    (largest, donor) => (!largest || donor.contribution > largest.contribution ? donor : largest),
    null,
  )
  const page = activeWorkspace === 'donors' && accountRole === 'largest-donor'
    ? { eyebrow: 'PERSONAL INBOX', title: 'Donor inbox', description: 'Review project notices and record your decision on each funding item.' }
    : workspaceCopy[activeWorkspace]
  const currentNotifications = notifications.filter((notification) => notification.proposalId === CURRENT_PROPOSAL_ID)
  const votes = donors.map((donor) => {
    const decision = currentNotifications.find((notification) => notification.donorId === donor.id)?.decision
    return decision === 'approved' ? 'approve' : decision === 'rejected' ? 'oppose' : null
  })
  const approvalCount = votes.filter((vote) => vote === 'approve').length
  const oppositionCount = votes.filter((vote) => vote === 'oppose').length
  const allDonorsNotified = donors.length > 0 && currentNotifications.length === donors.length
  const approvalThresholdMet = donors.length > 0 && approvalCount * 100 > donors.length * 50
  const oppositionThresholdMet = donors.length > 0 && oppositionCount * 100 < donors.length * 30
  const releaseReady = allDonorsNotified && approvalThresholdMet && oppositionThresholdMet
  const allDonorsVoted = allDonorsNotified && votes.every((vote) => vote !== null)
  const proposalRejected = donors.length > 0 && (
    oppositionCount * 100 >= donors.length * 30 || (allDonorsVoted && !approvalThresholdMet)
  )
  const walletRoleLabel = !wallet.account
    ? 'Wallet not connected'
    : wallet.isManager
      ? 'Project manager'
      : wallet.snapshot?.isDonor
        ? 'Registered donor'
        : 'Connected wallet'

  useEffect(() => {
    let active = true
    async function loadLocalData() {
      try {
        await initializeDonorDatabase()
        const [storedDonors, storedNotifications] = await Promise.all([getDonors(), getNotifications()])
        if (active) {
          setDonors(storedDonors)
          setNotifications(storedNotifications)
          setDatabaseReady(true)
        }
      } catch (error) {
        if (active) setDatabaseError(error instanceof Error ? error.message : 'Unable to load the local donor database.')
      }
    }
    void loadLocalData()
    return () => { active = false }
  }, [])

  async function refreshDonorData() {
    const [storedDonors, storedNotifications] = await Promise.all([getDonors(), getNotifications()])
    setDonors(storedDonors)
    setNotifications(storedNotifications)
  }

  async function notifyDonors() {
    if (!wallet.isManager) {
      setToast('Only the project manager can notify donor accounts.')
      return
    }
    if (!databaseReady) {
      setToast('The local donor database is still loading.')
      return
    }
    try {
      await sendDonorNotifications({
        proposalId: CURRENT_PROPOSAL_ID,
        projectName: 'Mountain School Water Access',
        trancheNumber: 2,
        fundingItem: 'Water filtration equipment',
        amount: 18600,
        message: 'Please review the completed project update and itemized supplier quotation before recording your decision.',
      })
      await refreshDonorData()
      notificationApi.success({
        message: 'Notification sent successfully',
        placement: 'top',
        duration: 3,
        closable: false,
      })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save donor notifications.')
    }
  }

  async function handleDonorDecision(notificationId: string, decision: Exclude<DonorDecision, 'pending'>) {
    const notification = notifications.find((item) => item.id === notificationId)
    if (accountRole !== 'largest-donor' || !largestDonor || notification?.donorId !== largestDonor.id) {
      setToast('Only the largest donor account can decide on this notification.')
      return
    }
    try {
      await decideNotification(notificationId, decision)
      await refreshDonorData()
      setToast(decision === 'approved' ? 'Your approval was saved in this browser.' : 'Your rejection was saved in this browser.')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save your decision.')
    }
  }

  const canManageProject = wallet.isManager
  const visibleNavigation = canManageProject
    ? navigation
    : navigation.filter((item) => item.id === 'projects')

  useEffect(() => {
    if (!visibleNavigation.some((item) => item.id === activeWorkspace)) {
      setActiveWorkspace('projects')
    }
  }, [activeWorkspace, canManageProject])

  useEffect(() => {
    document.title = wallet.isManager
      ? 'GoodFund | Manager workspace'
      : wallet.snapshot?.isDonor
        ? 'GoodFund | Donor workspace'
        : 'GoodFund | Funding project'
  }, [wallet.isManager, wallet.snapshot?.isDonor])

  function openAccountLogin() {
    setSelectedAccountRole(accountRole === 'admin' ? 'largest-donor' : 'admin')
    setAccountLoginOpen(true)
  }

  function loginToSelectedAccount() {
    setAccountRole(selectedAccountRole)
    setActiveWorkspace(selectedAccountRole === 'admin' ? 'projects' : 'donors')
    setAccountLoginOpen(false)
    setToast(selectedAccountRole === 'admin' ? 'Signed in as the project administrator.' : 'Signed in as the largest donor.')
  }

  return (
    <div className="app-shell">
      {notificationContextHolder}
      <aside className="sidebar">
        <a className="brand" href="#workspace" aria-label="GoodFund home">
          <span className="brand-mark">G</span>
          <span className="brand-name">goodfund<span>.</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNavigation.map((item) => (
            <Button
              key={item.id}
              type="text"
              className={`nav-item ${activeWorkspace === item.id ? 'is-active' : ''}`}
              icon={item.icon}
              aria-current={activeWorkspace === item.id ? 'page' : undefined}
              onClick={() => setActiveWorkspace(item.id)}
            >
              {accountRole === 'largest-donor' ? 'My notifications' : item.label}
              {item.id === 'donors' && (wallet.snapshot?.donorCount ?? 0) > 0 && (
                <span className="nav-count">{wallet.snapshot?.donorCount}</span>
              )}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`chain-card ${wallet.isCorrectNetwork ? 'is-live' : ''}`}>
            <span className="chain-indicator" />
            <span>
              <strong>{wallet.isCorrectNetwork ? 'Localhost 31337' : 'Local network'}</strong>
              <small>{wallet.account ? shortAddress(wallet.account) : 'Anvil · wallet not connected'}</small>
            </span>
          </div>
          {wallet.isLocalDemoWallet ? (
            <Button type="text" className="profile-row" aria-label="Switch account or sign in as another user" onClick={openAccountLogin}>
              <span className="profile-avatar">{accountRole === 'admin' ? 'MC' : largestDonor?.initials ?? 'D'}</span>
              <span><strong>{accountRole === 'admin' ? 'Mei Chen' : largestDonor?.name ?? 'Largest donor'}</strong><small>{accountRole === 'admin' ? 'Administrator' : 'Largest donor'}</small></span>
              <ArrowRightOutlined className="profile-chevron" />
            </Button>
          ) : (
            <div className="profile-row wallet-profile-row">
              <span className="profile-avatar">{wallet.account ? 'W' : '—'}</span>
              <span>
                <strong>{wallet.account ? walletLabel(wallet.account) : 'Browser wallet'}</strong>
                <small>{wallet.account ? `${walletRoleLabel} · ${shortAddress(wallet.account)}` : walletRoleLabel}</small>
              </span>
            </div>
          )}
        </div>
      </aside>

      <Modal
        className="account-login-modal"
        open={wallet.isLocalDemoWallet && accountLoginOpen}
        title={<div><p className="eyebrow">GOODFUND DEMO</p><h2>Sign in as another user</h2><p className="account-modal-subtitle">Choose an account to continue in this prototype.</p></div>}
        onCancel={() => setAccountLoginOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAccountLoginOpen(false)}>Cancel</Button>,
          <Button key="login" type="primary" disabled={selectedAccountRole === 'largest-donor' && !largestDonor} onClick={loginToSelectedAccount}>Log in</Button>,
        ]}
      >
        <div className="account-options">
          <Button type="text" className={`account-option ${selectedAccountRole === 'admin' ? 'is-selected' : ''}`} onClick={() => setSelectedAccountRole('admin')}>
            <span className="account-option-icon admin-icon"><SafetyCertificateOutlined /></span>
            <span className="account-option-copy"><strong>Mei Chen</strong><small>Administrator · Manage all donors and send notices</small></span>
            {accountRole === 'admin' && <Tag color="purple">Current</Tag>}
          </Button>
          <Button type="text" className={`account-option ${selectedAccountRole === 'largest-donor' ? 'is-selected' : ''}`} disabled={!largestDonor} onClick={() => setSelectedAccountRole('largest-donor')}>
            <span className="account-option-icon donor-icon"><TeamOutlined /></span>
            <span className="account-option-copy"><strong>{largestDonor?.name ?? 'Loading donor account'}</strong><small>Largest donor · View notices and approve or reject</small></span>
            {accountRole === 'largest-donor' && <Tag color="purple">Current</Tag>}
          </Button>
        </div>
        <p className="account-modal-note">Demo account switching only. Production sign-in should be connected to verified identity and wallet authorization.</p>
      </Modal>

      <main className="main-area" id="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>GoodFund</span><i>/</i><strong>{page.title}</strong></div>
          <div className="topbar-actions">
            <span className="demo-label">LIVE LOCAL CHAIN</span>
            <Button
              className="wallet-button"
              icon={<ArrowRightOutlined />}
              loading={wallet.connecting}
              onClick={() => void wallet.connect()}
            >
              {wallet.account ? shortAddress(wallet.account) : 'Connect wallet'}
            </Button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="subtitle">{page.description}</p></div>
            {activeWorkspace === 'projects' && canManageProject && wallet.isLocalDemoWallet && (
              <Button type="primary" className="primary-button" icon={<BellOutlined />} onClick={notifyDonors}>
                Notify donors
              </Button>
            )}
          </div>

          {toast && <Alert className="toast" type="info" showIcon closable message={toast} onClose={() => setToast('')} />}
          {databaseError && <Alert className="toast" type="error" showIcon message={databaseError} />}
          {activeWorkspace === 'projects' && <WalletDonationPanel wallet={wallet} />}
          {activeWorkspace === 'projects' && (!wallet.isLocalDemoWallet || accountRole === 'admin') && (
            <ProjectsView
              canManage={canManageProject}
              canNotify={canManageProject && wallet.isLocalDemoWallet}
              onNotify={notifyDonors}
              snapshot={wallet.snapshot}
            />
          )}
          {activeWorkspace === 'donors' && !isProductMode && databaseReady && (
            <DonorsView
              role={accountRole}
              donors={donors}
              notifications={notifications}
              votes={votes}
              largestDonor={largestDonor}
              onDecision={handleDonorDecision}
            />
          )}
          {activeWorkspace === 'donors' && isProductMode && <LiveDonorsView snapshot={wallet.snapshot} />}
          {activeWorkspace === 'donors' && !isProductMode && !databaseReady && !databaseError && <Card className="panel loading-panel">Loading local donor records…</Card>}
          {activeWorkspace === 'approval-flow' && (
            isProductMode ? (
              <LiveApprovalFlowView
                snapshot={wallet.snapshot}
                onOpenContract={() => setActiveWorkspace('contract')}
              />
            ) : <ApprovalFlowView
              donors={donors}
              notifications={currentNotifications}
              votes={votes}
              approvalCount={approvalCount}
              oppositionCount={oppositionCount}
              approvalThresholdMet={approvalThresholdMet}
              oppositionThresholdMet={oppositionThresholdMet}
              allDonorsNotified={allDonorsNotified}
              releaseReady={releaseReady}
              proposalRejected={proposalRejected}
              onNotify={notifyDonors}
              onOpenContract={() => setActiveWorkspace('contract')}
            />
          )}
          {activeWorkspace === 'contract' && (
            isProductMode
              ? <LiveContractView snapshot={wallet.snapshot} />
              : <ContractView approvalCount={approvalCount} oppositionCount={oppositionCount} donorCount={donors.length} />
          )}

          <footer className="page-footer"><span>GoodFund · Transparent giving, accountable delivery.</span><a href="/api/v1/health" target="_blank" rel="noreferrer">API status <ArrowRightOutlined /></a></footer>
        </div>
      </main>
    </div>
  )
}

function ProjectsView({
  canManage,
  canNotify,
  onNotify,
  snapshot,
}: {
  canManage: boolean
  canNotify: boolean
  onNotify: () => void
  snapshot: ChainSnapshot | null
}) {
  const donorCount = snapshot?.donorCount ?? 0
  const votes = snapshot?.votes ?? 0
  const participationPercent = donorCount > 0 ? Math.round((votes / donorCount) * 100) : 0
  const currentTranche = snapshot?.currentTranche ?? 0
  const rejection = canManage && snapshot?.latestRejection?.tranche === currentTranche
    && !snapshot.hasActiveProposal
    ? snapshot.latestRejection
    : null
  const releaseStatus = (tranche: number) => {
    if (!snapshot) return <Tag>Loading</Tag>
    if (tranche < currentTranche) return <Tag color="success">Completed</Tag>
    if (tranche === currentTranche) return <Tag color="gold">Current</Tag>
    return <Tag>Queued</Tag>
  }

  return (
    <>
      {rejection && (
        <Alert
          className="rejection-notice"
          type="error"
          showIcon
          message={`Payout proposal #${rejection.proposalId} was rejected`}
          description={(
            <div className="rejection-notice-copy">
              <span>{rejection.purpose} · {formatUsdFromEth(rejection.amountEth)}</span>
              <span>Final vote: {rejection.approvals} yes · {rejection.oppositions} no.</span>
              <span>
                {rejection.oppositions * 100 >= donorCount * 30
                  ? 'Opposition reached or exceeded 30%.'
                  : 'Voting ended without approval above 50%.'}
                {' '}The manager can submit a revised proposal.
              </span>
              <code>{rejection.transactionHash}</code>
            </div>
          )}
        />
      )}
      <section className="summary-grid" aria-label="On-chain funding summary">
        <Card className="summary-card summary-highlight"><span className="summary-label">Contract balance</span><Statistic value={formatUsdFromEth(snapshot?.balanceEth)} /><span className="summary-foot">Live Anvil balance · {snapshot?.balanceEth ?? '—'} test ETH</span></Card>
        <Card className="summary-card"><span className="summary-label">Total received</span><Statistic value={formatUsdFromEth(snapshot?.totalReceivedEth)} /><span className="summary-foot">Recorded by the contract · {snapshot?.totalReceivedEth ?? '—'} test ETH</span></Card>
        <Card className="summary-card"><span className="summary-label">Project state</span><Statistic value={phaseLabel(snapshot?.phase)} /><span className="summary-foot">Current tranche {snapshot ? String(snapshot.currentTranche).padStart(2, '0') : '—'}</span></Card>
      </section>

      <Card className="panel project-panel" bordered>
        <div className="panel-heading">
          <div className="project-title-wrap"><span className="project-symbol">WF</span><div><p className="eyebrow">DEMO PROJECT · PF-2025-018</p><h2>Mountain School Water Access</h2><p className="panel-subtitle">Single-project MVP using live local-chain transactions.</p></div></div>
          <Tag className="status-pill" color={snapshot?.phase === 2 ? 'success' : 'gold'} icon={<CheckCircleFilled />}>{phaseLabel(snapshot?.phase)}</Tag>
        </div>
        <div className="project-progress">
          <div className="progress-copy"><span>Donor participation</span><strong>{votes} <small>of {donorCount} registered donors voted</small></strong></div>
          <Progress percent={participationPercent} showInfo={false} strokeColor="#4a2a68" trailColor="#eeeaf0" />
          <span className="progress-percent">{participationPercent}% voted</span>
        </div>
        <div className="project-facts"><div><span>Project manager</span><strong>{snapshot ? shortAddress(snapshot.manager) : '—'}</strong></div><div><span>Current approvals</span><strong>{snapshot?.approvals ?? 0} of {donorCount}</strong></div><div><span>Current opposition</span><strong>{snapshot?.oppositions ?? 0} of {donorCount}</strong></div></div>
        <div className="panel-divider" />
        <div className="table-heading">
          <div><h3>Demo funding schedule</h3><p>Illustrative milestones; release status follows the live contract.</p></div>
          {canNotify && (
            <Button className="secondary-button" icon={<BellOutlined />} onClick={onNotify}>
              Notify donors
            </Button>
          )}
        </div>
        <div className="release-table">
          <div className="release-row release-header"><span>TRANCHE</span><span>FUNDING ITEM</span><span>AMOUNT</span><span>STATUS</span></div>
          <div className="release-row"><span>01</span><span><strong>Water source assessment</strong><small>Field survey and site selection</small></span><span>$800 · 0.4 ETH</span>{releaseStatus(1)}</div>
          <div className="release-row"><span>02</span><span><strong>Water filtration equipment</strong><small>Procurement for three schools</small></span><span>$800 · 0.4 ETH</span>{releaseStatus(2)}</div>
          <div className="release-row"><span>03</span><span><strong>Installation & commissioning</strong><small>Installation, testing, handover</small></span><span>$400 · 0.2 ETH</span>{releaseStatus(3)}</div>
        </div>
      </Card>
      <p className="prototype-note">USD uses a fixed demo rate of 1 ETH = $2,000. Project materials and milestone names are demo content; balances, tranche state, votes, and execution records come from the local smart contract.</p>
    </>
  )
}

function LiveDonorsView({ snapshot }: { snapshot: ChainSnapshot | null }) {
  const donors = snapshot?.knownDonors ?? []
  return (
    <Card className="panel directory-panel" bordered>
      <div className="table-heading directory-heading">
        <div>
          <h2>On-chain donor directory</h2>
          <p>Registered donor wallets and their vote on the current proposal.</p>
        </div>
        <Tag color="purple">{snapshot?.donorCount ?? 0} registered</Tag>
      </div>
      <div className="donor-table">
        <div className="donor-table-row donor-table-header">
          <span>DONOR WALLET</span>
          <span>ROLE</span>
          <span>CURRENT PROPOSAL</span>
        </div>
        {donors.map((donor) => {
          const vote = snapshot?.hasActiveProposal
            ? donor.approved ? 'approve' : donor.opposed ? 'oppose' : null
            : null
          return (
            <article className="donor-table-row" key={donor.address}>
              <div className="donor-cell">
                <span className="donor-avatar">{donor.label.slice(-1)}</span>
                <span><strong>{donor.label}</strong><small>{donor.address}</small></span>
              </div>
              <strong className="contribution">On-chain donor</strong>
              <div className="donor-approval">
                <span>
                  <strong>{snapshot?.hasActiveProposal ? 'Live contract vote' : 'No active proposal'}</strong>
                  <small>{snapshot?.hasActiveProposal ? 'Recorded directly by the donor wallet' : 'Voting opens when the manager submits a proposal'}</small>
                </span>
                {snapshot?.hasActiveProposal && <VoteTag vote={vote} notified />}
              </div>
            </article>
          )
        })}
        {snapshot && donors.length === 0 && <p className="empty-search">No wallet addresses have donated yet.</p>}
        {!snapshot && <p className="empty-search">Loading donor state from the local contract…</p>}
      </div>
      <div className="table-bottom">
        <span>Showing {donors.length} registered demo donors</span>
        <span>The contract records the donor set but not each address's cumulative contribution.</span>
      </div>
    </Card>
  )
}

function LiveApprovalFlowView({
  snapshot,
  onOpenContract,
}: {
  snapshot: ChainSnapshot | null
  onOpenContract: () => void
}) {
  const hasActiveProposal = Boolean(snapshot?.hasActiveProposal)
  const donorCount = snapshot?.donorCount ?? 0
  const approvals = snapshot?.approvals ?? 0
  const oppositions = snapshot?.oppositions ?? 0
  const approvalMet = donorCount > 0 && approvals * 100 > donorCount * 50
  const oppositionMet = donorCount > 0 && oppositions * 100 < donorCount * 30
  const materialLink = materialHref(snapshot?.proposedApprovalMaterialUri ?? '')
  const rejection = snapshot
    && snapshot.latestRejection?.tranche === snapshot.currentTranche
    && !hasActiveProposal
    ? snapshot.latestRejection
    : null

  return (
    <>
      {rejection && (
        <Alert
          className="rejection-notice"
          type="error"
          showIcon
          message={`Payout proposal #${rejection.proposalId} was rejected`}
          description={(
            <div className="rejection-notice-copy">
              <span>{rejection.purpose} · {formatUsdFromEth(rejection.amountEth)}</span>
              <span>Final vote: {rejection.approvals} yes · {rejection.oppositions} no.</span>
              <span>
                {rejection.oppositions * 100 >= donorCount * 30
                  ? 'Opposition reached or exceeded 30%.'
                  : 'Voting ended without approval above 50%.'}
                {' '}The manager can submit a revised proposal.
              </span>
              <code>{rejection.transactionHash}</code>
            </div>
          )}
        />
      )}
      <section className="flow-banner">
        <div>
          <span className="flow-overline">CURRENT RELEASE · TRANCHE {snapshot ? String(snapshot.currentTranche).padStart(2, '0') : '—'}</span>
          <h2>{hasActiveProposal ? snapshot?.proposedPurpose : 'No active payout proposal'}</h2>
          <p>
            {hasActiveProposal
              ? `Recipient ${shortAddress(snapshot?.proposedRecipient)} · proposed by the contract manager`
              : 'The manager can submit the next payout proposal after the current tranche is open.'}
          </p>
        </div>
        <strong>{hasActiveProposal ? formatUsdFromEth(snapshot?.proposedAmountEth) : '—'} <small>{hasActiveProposal ? `${snapshot?.proposedAmountEth} test ETH` : 'No proposal'}</small></strong>
      </section>
      <div className="flow-layout">
        <Card className="panel flow-panel" bordered>
          <div className="table-heading">
            <div><h3>On-chain approval flow</h3><p>Counts are read directly from the local contract.</p></div>
            <span className="flow-counter">{approvals}<small> yes</small> · {oppositions}<small> no</small></span>
          </div>
          <Steps
            className="flow-steps"
            direction="vertical"
            current={snapshot?.phase === 3 ? 2 : snapshot?.phase === 2 ? 2 : hasActiveProposal ? 1 : 0}
            items={[
              { title: 'Proposal and material submitted', description: hasActiveProposal ? `Proposal #${snapshot?.currentProposalId}` : 'Waiting for the manager', status: hasActiveProposal ? 'finish' : 'wait' },
              { title: 'Donor vote', description: hasActiveProposal ? `Yes ${approvals}/${donorCount} · No ${oppositions}/${donorCount}` : 'No active proposal', status: snapshot?.phase === 2 ? 'finish' : snapshot?.phase === 1 ? 'process' : 'wait' },
              { title: 'Payout execution', description: snapshot?.phase === 3 ? 'Payout sent; execution evidence pending' : snapshot?.phase === 2 ? 'Ready for the manager to execute' : 'Locked until thresholds are met', status: snapshot?.phase === 2 ? 'process' : snapshot?.phase === 3 ? 'finish' : 'wait' },
            ]}
          />
          {hasActiveProposal && (
            <div className="threshold-summary">
              <Tag color={approvalMet ? 'success' : 'gold'}>Yes &gt; 50% · {approvalMet ? 'Met' : 'Not met'}</Tag>
              <Tag color={oppositionMet ? 'success' : 'error'}>No &lt; 30% · {oppositionMet ? 'Met' : 'Exceeded'}</Tag>
            </div>
          )}
          {hasActiveProposal && (
            <div className="flow-donors">
              <div className="flow-donor-row flow-donor-heading"><span>DONOR WALLET</span><span>ON-CHAIN DECISION</span></div>
              {(snapshot?.knownDonors ?? []).map((donor) => (
                <div className="flow-donor-row" key={donor.address}>
                  <span className="donor-cell"><span className="donor-avatar">{donor.label.slice(-1)}</span><span><strong>{donor.label}</strong><small>{donor.address}</small></span></span>
                  <VoteTag vote={donor.approved ? 'approve' : donor.opposed ? 'oppose' : null} notified />
                </div>
              ))}
            </div>
          )}
          <Alert
            className="flow-alert"
            type={snapshot?.phase === 2 ? 'success' : snapshot?.phase === 3 ? 'info' : 'info'}
            showIcon
            message={hasActiveProposal
              ? snapshot?.phase === 2
                ? 'Thresholds met. The manager can execute the payout.'
                : snapshot?.phase === 3
                  ? 'Payout executed. Execution evidence is required before the next tranche.'
                  : approvalMet && oppositionMet
                    ? 'Both thresholds are met.'
                    : 'The payout remains locked until both thresholds are met.'
              : 'There is no active proposal to review.'}
          />
          <div className="flow-actions">
            <p>Donor decisions are recorded by each wallet directly on the local contract.</p>
            {materialLink && <Button href={materialLink} target="_blank" rel="noreferrer">Open approval material</Button>}
          </div>
        </Card>
        <aside className="contract-shortcut">
          <span className="shortcut-icon"><LockOutlined /></span>
          <p className="eyebrow">ON-CHAIN ENFORCEMENT</p>
          <h3>The contract enforces both voting thresholds.</h3>
          <p>Release recipient, amount, purpose, and approval material hash are fixed when the proposal is created.</p>
          <Button type="link" className="text-button" icon={<ArrowRightOutlined />} onClick={onOpenContract}>Open fund contract</Button>
        </aside>
      </div>
    </>
  )
}

function LiveContractView({ snapshot }: { snapshot: ChainSnapshot | null }) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const votes = snapshot ? snapshot.approvals + snapshot.oppositions : 0

  return (
    <>
      <section className="contract-overview">
        <div className="contract-badge">GF</div>
        <div className="contract-main">
          <p className="eyebrow">DEPLOYED CONTRACT · LOCALHOST 31337</p>
          <h2>Mountain School Water Access Fund</h2>
          <code>{WELFARE_FUND_ADDRESS}</code>
        </div>
        <Tag className="status-pill" color="success" icon={<CheckCircleFilled />}>{phaseLabel(snapshot?.phase)}</Tag>
      </section>
      <section className="contract-metrics">
        <Card><span>Contract balance</span><Statistic value={formatUsdFromEth(snapshot?.balanceEth)} /></Card>
        <Card><span>Current tranche</span><Statistic value={snapshot?.currentTranche ?? '—'} formatter={(value) => String(value).padStart(2, '0')} /></Card>
        <Card><span>Votes recorded</span><Statistic value={votes} suffix={` of ${snapshot?.donorCount ?? 0}`} /></Card>
      </section>

      <Card className="panel contract-rules" bordered>
        <div className="rules-preview">
          <span className="rules-preview-icon"><SafetyCertificateOutlined /></span>
          <div><p className="eyebrow">SMART CONTRACT POLICY</p><h2>Release conditions</h2><p>Approval must exceed 50%, opposition must stay below 30%, and execution evidence is required before the next tranche.</p></div>
          <Button type="primary" className="primary-button" icon={<ArrowRightOutlined />} onClick={() => setRulesOpen(true)}>View full-screen rules</Button>
        </div>
      </Card>

      <Modal
        open={rulesOpen}
        onCancel={() => setRulesOpen(false)}
        title={null}
        footer={<Button type="primary" onClick={() => setRulesOpen(false)}>Close conditions</Button>}
        closeIcon={<CloseOutlined />}
        width="100vw"
        className="release-modal"
        style={{ top: 0, maxWidth: '100vw', paddingBottom: 0 }}
      >
        <div className="modal-policy-content">
          <p className="eyebrow">MOUNTAIN SCHOOL WATER ACCESS FUND · LOCAL CONTRACT</p>
          <h2>Release conditions</h2>
          <p className="modal-intro">These rules govern when funds can leave the project contract. Each percentage is measured against all registered donor addresses.</p>
          <div className="modal-rules">
            {releaseRules.map((rule, index) => <Card className="modal-rule" key={rule.title}><span className="rule-number">0{index + 1}</span><div><h3>{rule.title}</h3><p>{rule.description}</p></div><CheckCircleFilled className="modal-rule-check" /></Card>)}
          </div>
          <Alert type="info" showIcon message="One address, one vote" description="Votes are not weighted by donation amount. New deposits are paused while a tranche is under review so the voting denominator cannot change." />
        </div>
      </Modal>

      <Card className="panel event-panel" bordered>
        <div className="table-heading">
          <div><h3>Current on-chain record</h3><p>Latest contract state available to the frontend.</p></div>
          <Tag color="gold">LOCALHOST 31337</Tag>
        </div>
        <div className="event-row"><span className="event-dot event-green"/><span><strong>Contract manager</strong><small>{snapshot?.manager ?? 'Loading…'}</small></span><span className="event-value">Immutable</span></div>
        <div className="event-row"><span className="event-dot event-yellow"/><span><strong>Latest execution evidence</strong><small>{snapshot?.lastExecutionEvidenceHash ?? '—'}</small></span><span className="event-value">{snapshot?.lastExecutionEvidenceHash === `0x${'0'.repeat(64)}` ? 'Not submitted' : 'Recorded'}</span></div>
      </Card>
      <p className="prototype-note">This page uses the deployed local contract. A block explorer and historical event index are outside the current MVP.</p>
    </>
  )
}

function DecisionTag({ decision }: { decision: DonorDecision }) {
  if (decision === 'approved') return <Tag color="success" icon={<CheckCircleFilled />}>Agreed</Tag>
  if (decision === 'rejected') return <Tag color="error" icon={<CloseOutlined />}>Rejected</Tag>
  return <Tag color="gold">Awaiting response</Tag>
}

function DonorsView({
  role,
  donors,
  notifications,
  votes,
  largestDonor,
  onDecision,
}: {
  role: AccountRole
  donors: DonorRecord[]
  notifications: DonorNotification[]
  votes: Vote[]
  largestDonor: DonorRecord | null
  onDecision: (notificationId: string, decision: Exclude<DonorDecision, 'pending'>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [savingNotificationId, setSavingNotificationId] = useState('')
  const [detailsNotificationId, setDetailsNotificationId] = useState('')
  const searchTerm = query.trim().toLowerCase()
  const filteredDonors = donors.filter((donor) => `${donor.name} ${donor.address}`.toLowerCase().includes(searchTerm))
  const selectedNotification = notifications.find((notification) => notification.id === detailsNotificationId)

  async function saveDecision(notificationId: string, decision: Exclude<DonorDecision, 'pending'>) {
    setSavingNotificationId(notificationId)
    try {
      await onDecision(notificationId, decision)
    } finally {
      setSavingNotificationId('')
    }
  }

  if (role === 'largest-donor') {
    const inbox = notifications.filter((notification) => notification.donorId === largestDonor?.id)
    return (
      <div className="donor-inbox-layout">
        {largestDonor && <Card className="largest-donor-card"><span className="donor-avatar">{largestDonor.initials}</span><div><p className="eyebrow">LARGEST DONOR ACCOUNT</p><h2>{largestDonor.name}</h2><p>{largestDonor.address}</p></div><strong>${largestDonor.contribution.toLocaleString('en-US')}<small> contributed</small></strong></Card>}
        <Card className="panel inbox-panel" bordered>
          <div className="table-heading"><div><h2>Funding notifications</h2><p>Each notice is tied to a specific project tranche.</p></div><Tag color="purple">{inbox.filter((item) => item.decision === 'pending').length} awaiting response</Tag></div>
          {inbox.length === 0 && <div className="inbox-empty"><BellOutlined /><h3>No funding notifications yet</h3><p>New funding requests sent by the administrator will appear here.</p></div>}
          <div className="notification-list">
            {inbox.map((notification) => (
              <article className="notification-card" key={notification.id}>
                <div className="notification-heading"><div><p className="eyebrow">TRANCHE {String(notification.trancheNumber).padStart(2, '0')} · FUNDING REQUEST</p><h3>{notification.fundingItem}</h3></div><DecisionTag decision={notification.decision} /></div>
                <p className="notification-project">{notification.projectName} · ${notification.amount.toLocaleString('en-US')}</p>
                <p className="notification-message">{notification.message}</p>
                <div className="notification-footer"><span>Received {new Date(notification.sentAt).toLocaleString('en-US')}</span>
                  {notification.decision === 'pending' ? (
                    <div className="notification-actions">
                      <Button icon={<EyeOutlined />} onClick={() => setDetailsNotificationId(notification.id)}>View details</Button>
                      <Button type="primary" loading={savingNotificationId === notification.id} onClick={() => void saveDecision(notification.id, 'approved')}>Agree</Button>
                      <Button danger loading={savingNotificationId === notification.id} onClick={() => void saveDecision(notification.id, 'rejected')}>Reject</Button>
                    </div>
                  ) : <div className="notification-actions"><Button icon={<EyeOutlined />} onClick={() => setDetailsNotificationId(notification.id)}>View details</Button><span className="decision-recorded">Decision recorded {notification.decidedAt ? new Date(notification.decidedAt).toLocaleString('en-US') : ''}</span></div>}
                </div>
              </article>
            ))}
          </div>
          <p className="prototype-note">Your decision is saved locally in this browser's IndexedDB. Wallet signing is not connected.</p>
        </Card>
        <Modal
          className="release-details-modal"
          open={Boolean(selectedNotification)}
          width={1080}
          title={selectedNotification && <div className="details-modal-title"><p className="eyebrow">TRANCHE {String(selectedNotification.trancheNumber).padStart(2, '0')} · RELEASE REVIEW</p><h2>{selectedNotification.fundingItem}</h2><p>{selectedNotification.projectName} · ${selectedNotification.amount.toLocaleString('en-US')}</p></div>}
          onCancel={() => setDetailsNotificationId('')}
          footer={selectedNotification?.decision === 'pending' ? [
            <Button key="close" onClick={() => setDetailsNotificationId('')}>Close</Button>,
            <Button key="reject" danger loading={savingNotificationId === selectedNotification.id} onClick={() => void saveDecision(selectedNotification.id, 'rejected')}>Reject proposal</Button>,
            <Button key="agree" type="primary" loading={savingNotificationId === selectedNotification.id} onClick={() => void saveDecision(selectedNotification.id, 'approved')}>Agree to release</Button>,
          ] : <Button onClick={() => setDetailsNotificationId('')}>Close details</Button>}
        >
          {selectedNotification && (
            <div className="release-details-content">
              <Alert className="details-disclaimer" type="info" showIcon message="Review supporting details before you decide." description="This prototype uses sample illustrations and a sample supplier quotation. No equipment delivery or payment is represented as verified evidence." />
              <section className="details-section">
                <div className="details-section-heading"><div><p className="eyebrow">PREVIOUS MILESTONE · TRANCHE 01</p><h3>Work completed so far</h3></div><Tag color="success">Reported complete</Tag></div>
                <div className="evidence-gallery">
                  {completedWork.map((work) => <article className="evidence-card" key={work.title}><img src={work.image} alt={work.imageAlt} /><div className="evidence-card-body"><span>{work.imageLabel}</span><h4>{work.title}</h4><p>{work.description}</p></div></article>)}
                </div>
              </section>
              <section className="details-section">
                <div className="details-section-heading"><div><p className="eyebrow">CURRENT REQUEST · TRANCHE {String(selectedNotification.trancheNumber).padStart(2, '0')}</p><h3>Proposed use of funds</h3></div><Tag color="gold">Not yet paid</Tag></div>
                <p className="details-section-copy">The requested ${selectedNotification.amount.toLocaleString('en-US')} is planned for water filtration equipment at three schools. The breakdown below is a supplier quotation and proposed budget, not a paid invoice.</p>
                <div className="quote-summary"><div><span>Supplier</span><strong>ClearWater Systems Ltd.</strong></div><div><span>Quotation</span><strong>Q-2025-1048</strong></div><div><span>Issue date</span><strong>Oct 09, 2025</strong></div><div><span>Payment status</span><strong>Pending donor approval</strong></div></div>
                <div className="expense-table">
                  <div className="expense-row expense-header"><span>PLANNED EXPENSE</span><span>DESCRIPTION</span><span>AMOUNT</span></div>
                  {proposedExpenses.map((expense) => <div className="expense-row" key={expense.item}><strong>{expense.item}</strong><span>{expense.detail}</span><strong>${expense.amount.toLocaleString('en-US')}</strong></div>)}
                  <div className="expense-row expense-total"><strong>Requested release total</strong><span>Supplier quotation · Q-2025-1048</span><strong>${proposedExpenses.reduce((total, expense) => total + expense.amount, 0).toLocaleString('en-US')}</strong></div>
                </div>
              </section>
              <p className="details-footnote">This is sample project data stored with the prototype. Actual photos, invoice files, and verified expense receipts are not connected yet.</p>
            </div>
          )}
        </Modal>
      </div>
    )
  }

  return (
    <Card className="panel directory-panel" bordered>
      <div className="table-heading directory-heading"><div><h2>Donor directory</h2><p>Donor profiles and notification decisions stored in IndexedDB.</p></div><Input className="search-box" prefix={<SearchOutlined />} allowClear aria-label="Search donors" placeholder="Search donors" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="donor-table">
        <div className="donor-table-row donor-table-header"><span>DONOR</span><span>CONTRIBUTED</span><span>TRANCHE 02 NOTIFICATION</span></div>
        {filteredDonors.map((donor) => {
          const index = donors.findIndex((entry) => entry.address === donor.address)
          const vote = votes[index]
          const notified = notifications.some((notification) => notification.donorId === donor.id && notification.proposalId === CURRENT_PROPOSAL_ID)
          return (
            <article className="donor-table-row" key={donor.address}>
              <div className="donor-cell"><span className="donor-avatar">{donor.initials}</span><span><strong>{donor.name}</strong><small>{donor.address}</small></span></div>
              <strong className="contribution">${donor.contribution.toLocaleString('en-US')}</strong>
              <div className="donor-approval"><span><strong>Water filtration equipment</strong><small>{notified ? 'Notification delivered' : 'Not notified'}</small></span><VoteTag vote={vote} notified={notified} /></div>
            </article>
          )
        })}
        {filteredDonors.length === 0 && <p className="empty-search">No donors or funding items match your search.</p>}
      </div>
      <div className="table-bottom"><span>Showing {filteredDonors.length} donors</span><span>Profiles stored in this browser</span></div>
    </Card>
  )
}

function VoteTag({ vote, notified }: { vote: Vote; notified: boolean }) {
  if (vote === 'approve') return <Tag color="success" icon={<CheckCircleFilled />}>Approved</Tag>
  if (vote === 'oppose') return <Tag color="error" icon={<CloseOutlined />}>Opposed</Tag>
  return <Tag color={notified ? 'gold' : 'default'}>{notified ? 'Awaiting response' : 'Not notified'}</Tag>
}

function ApprovalFlowView({
  donors,
  notifications,
  votes,
  approvalCount,
  oppositionCount,
  approvalThresholdMet,
  oppositionThresholdMet,
  allDonorsNotified,
  releaseReady,
  proposalRejected,
  onNotify,
  onOpenContract,
}: {
  donors: DonorRecord[]
  notifications: DonorNotification[]
  votes: Vote[]
  approvalCount: number
  oppositionCount: number
  approvalThresholdMet: boolean
  oppositionThresholdMet: boolean
  allDonorsNotified: boolean
  releaseReady: boolean
  proposalRejected: boolean
  onNotify: () => void
  onOpenContract: () => void
}) {
  const votesFinished = allDonorsNotified && votes.every((vote) => vote !== null)
  const flowStatus = proposalRejected
    ? 'Proposal rejected. It cannot be released; the administrator may submit a new proposal.'
    : releaseReady
      ? 'Thresholds met. The tranche is ready for contract execution.'
      : allDonorsNotified
        ? 'The release remains locked until both voting thresholds are met.'
        : 'No notifications have been sent for this tranche yet.'

  return (
    <>
      <section className="flow-banner"><div><span className="flow-overline">CURRENT RELEASE · TRANCHE 02</span><h2>Water filtration equipment</h2><p>Procurement for three rural schools · Proposed by Mei Chen</p></div><strong>$18,600 <small>USDC</small></strong></section>
      <div className="flow-layout">
        <Card className="panel flow-panel" bordered>
          <div className="table-heading"><div><h3>Shareholder vote</h3><p>Votes are counted by registered donor address.</p></div><span className="flow-counter">{approvalCount}<small> yes</small> · {oppositionCount}<small> no</small></span></div>
          <Steps
            className="flow-steps"
            direction="vertical"
            current={releaseReady ? 2 : 1}
            items={[
              { title: 'Previous tranche completed', description: 'Execution evidence submitted · Oct 14, 2025', status: 'finish' },
              { title: 'Shareholder vote', description: `Yes ${approvalCount}/${donors.length} · No ${oppositionCount}/${donors.length}`, status: proposalRejected ? 'error' : 'process' },
              { title: 'Release from fund contract', description: releaseReady ? 'Ready for on-chain execution' : 'Locked until thresholds are met', status: releaseReady ? 'process' : 'wait' },
            ]}
          />
          <div className="threshold-summary">
            <Tag color={approvalThresholdMet ? 'success' : 'gold'}>Yes &gt; 50% · {approvalThresholdMet ? 'Met' : 'Not met'}</Tag>
            <Tag color={oppositionThresholdMet ? 'success' : 'error'}>No &lt; 30% · {oppositionThresholdMet ? 'Met' : 'Exceeded'}</Tag>
          </div>
          <div className="flow-donors"><div className="flow-donor-row flow-donor-heading"><span>SHAREHOLDER</span><span>DECISION</span></div>
            {donors.map((donor, index) => {
              const notified = notifications.some((notification) => notification.donorId === donor.id)
              return <div className="flow-donor-row" key={donor.address}><span className="donor-cell"><span className="donor-avatar">{donor.initials}</span><span><strong>{donor.name}</strong><small>{donor.address}</small></span></span><VoteTag vote={votes[index]} notified={notified} /></div>
            })}
          </div>
          <Alert className="flow-alert" type={proposalRejected ? 'error' : releaseReady ? 'success' : 'info'} showIcon message={flowStatus} />
          <div className="flow-actions"><p>Shareholders record decisions from their own donor account. Each address votes once per tranche.</p>{!allDonorsNotified && <Button type="primary" icon={<BellOutlined />} onClick={onNotify}>Notify donors</Button>}{votesFinished && !releaseReady && !proposalRejected && <Tag color="error">Voting complete · threshold not met</Tag>}</div>
        </Card>
        <aside className="contract-shortcut"><span className="shortcut-icon"><LockOutlined /></span><p className="eyebrow">ON-CHAIN ENFORCEMENT</p><h3>The contract enforces both voting thresholds.</h3><p>Release recipient and amount are fixed in the proposal. The contract stays locked until approval exceeds 50% and opposition remains below 30%.</p><Button type="link" className="text-button" icon={<ArrowRightOutlined />} onClick={onOpenContract}>Open fund contract</Button></aside>
      </div>
    </>
  )
}

function ContractView({ approvalCount, oppositionCount, donorCount }: { approvalCount: number; oppositionCount: number; donorCount: number }) {
  const [rulesOpen, setRulesOpen] = useState(false)

  return (
    <>
      <section className="contract-overview"><div className="contract-badge">GF</div><div className="contract-main"><p className="eyebrow">VERIFIED CONTRACT · SEPOLIA</p><h2>Mountain School Water Access Fund</h2><code>0x6E2b...A91B</code></div><Tag className="status-pill" color="success" icon={<CheckCircleFilled />}>Operational</Tag></section>
      <section className="contract-metrics"><Card><span>Contract balance</span><Statistic value={96400} suffix=" USDC" /></Card><Card><span>Current tranche</span><Statistic value={2} formatter={(value) => String(value).padStart(2, '0')} suffix=" of 05" /></Card><Card><span>Shareholder votes</span><Statistic value={approvalCount + oppositionCount} formatter={(value) => String(value).padStart(2, '0')} suffix={` of ${String(donorCount).padStart(2, '0')}`} /></Card></section>

      <Card className="panel contract-rules" bordered>
        <div className="rules-preview"><span className="rules-preview-icon"><SafetyCertificateOutlined /></span><div><p className="eyebrow">SMART CONTRACT POLICY</p><h2>Release conditions</h2><p>Approval must exceed 50%, opposition must stay below 30%, and execution evidence is required before the next tranche.</p></div><Button type="primary" className="primary-button" icon={<ArrowRightOutlined />} onClick={() => setRulesOpen(true)}>View full-screen rules</Button></div>
      </Card>

      <Modal
        open={rulesOpen}
        onCancel={() => setRulesOpen(false)}
        title={null}
        footer={<Button type="primary" onClick={() => setRulesOpen(false)}>Close conditions</Button>}
        closeIcon={<CloseOutlined />}
        width="100vw"
        className="release-modal"
        style={{ top: 0, maxWidth: '100vw', paddingBottom: 0 }}
      >
        <div className="modal-policy-content">
          <p className="eyebrow">MOUNTAIN SCHOOL WATER ACCESS FUND · TRANCHE 02</p>
          <h2>Release conditions</h2>
          <p className="modal-intro">These rules govern when funds can leave the project contract. Each percentage is measured against all registered shareholder addresses.</p>
          <div className="modal-rules">
            {releaseRules.map((rule, index) => <Card className="modal-rule" key={rule.title}><span className="rule-number">0{index + 1}</span><div><h3>{rule.title}</h3><p>{rule.description}</p></div><CheckCircleFilled className="modal-rule-check" /></Card>)}
          </div>
          <Alert type="info" showIcon message="One address, one vote" description="Votes are not weighted by donation amount. New deposits are paused while a tranche is under review so the voting denominator cannot change." />
        </div>
      </Modal>

      <Card className="panel event-panel" bordered><div className="table-heading"><div><h3>Recent contract activity</h3><p>Latest events indexed from the Sepolia testnet.</p></div><Tag color="gold">SEPOLIA TESTNET</Tag></div><div className="event-row"><span className="event-dot event-green"/><span><strong>ExecutionEvidenceSubmitted</strong><small>Tranche 01 · Oct 14, 2025 · 0x9ac4...e812</small></span><span className="event-value">Evidence recorded</span></div><div className="event-row"><span className="event-dot event-yellow"/><span><strong>TrancheProposed</strong><small>Tranche 02 · Oct 12, 2025 · 0x4f82...b603</small></span><span className="event-value">$18,600 USDC</span></div></Card>
      <p className="prototype-note">Contract details shown are sample data. The prototype is not connected to a live contract or explorer.</p>
    </>
  )
}

export default App
