// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract WelfareFund {
    enum Phase {
        Funding,
        AwaitingApproval,
        ReadyToDisburse,
        AwaitingExecutionReport
    }

    address public immutable manager;
    Phase public phase;
    uint256 public currentTranche = 1;
    uint256 public donorCount;
    uint256 public totalReceived;
    uint256 public proposedAmount;
    string public proposedPurpose;
    bytes32 public proposedApprovalMaterialHash;
    string public proposedApprovalMaterialUri;
    uint256 public currentProposalId;
    uint256 public approvalsForCurrentTranche;
    uint256 public oppositionsForCurrentTranche;
    uint256 public votesForCurrentTranche;
    address payable public proposedRecipient;
    bytes32 public lastExecutionEvidenceHash;

    mapping(address => bool) public isDonor;
    mapping(uint256 => mapping(address => bool)) public approvedForProposal;
    mapping(uint256 => mapping(address => bool)) public opposedForProposal;

    bool private _entered;

    event DonationReceived(address indexed donor, uint256 amount);
    event PayoutProposed(
        uint256 indexed proposalId,
        uint256 indexed tranche,
        address indexed recipient,
        uint256 amount,
        string purpose,
        bytes32 approvalMaterialHash,
        string approvalMaterialUri
    );
    event PayoutApproved(uint256 indexed proposalId, uint256 indexed tranche, address indexed donor);
    event PayoutOpposed(uint256 indexed proposalId, uint256 indexed tranche, address indexed donor);
    event PayoutRejected(
        uint256 indexed proposalId,
        uint256 indexed tranche,
        uint256 approvals,
        uint256 oppositions
    );
    event PayoutExecuted(
        uint256 indexed tranche,
        address indexed recipient,
        uint256 amount
    );
    event ExecutionReported(uint256 indexed tranche, bytes32 evidenceHash);

    modifier onlyManager() {
        require(msg.sender == manager, "not manager");
        _;
    }

    modifier nonReentrant() {
        require(!_entered, "reentrant call");
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address manager_) {
        require(manager_ != address(0), "zero manager");
        manager = manager_;
        phase = Phase.Funding;
    }

    function deposit() external payable nonReentrant {
        require(phase == Phase.Funding, "funding is paused");
        require(msg.value > 0, "zero donation");

        if (!isDonor[msg.sender]) {
            isDonor[msg.sender] = true;
            donorCount += 1;
        }
        totalReceived += msg.value;
        emit DonationReceived(msg.sender, msg.value);
    }

    function proposePayout(
        address payable recipient,
        uint256 amount,
        string calldata purpose,
        bytes32 approvalMaterialHash,
        string calldata approvalMaterialUri
    ) external onlyManager nonReentrant {
        require(phase == Phase.Funding, "previous tranche incomplete");
        require(donorCount > 0, "no donors");
        require(recipient != address(0), "zero recipient");
        require(amount > 0 && amount <= address(this).balance, "invalid amount");
        require(bytes(purpose).length > 0 && bytes(purpose).length <= 280, "invalid purpose");
        require(approvalMaterialHash != bytes32(0), "missing approval material");
        require(
            bytes(approvalMaterialUri).length > 0 && bytes(approvalMaterialUri).length <= 512,
            "invalid material uri"
        );

        proposedRecipient = recipient;
        proposedAmount = amount;
        proposedPurpose = purpose;
        proposedApprovalMaterialHash = approvalMaterialHash;
        proposedApprovalMaterialUri = approvalMaterialUri;
        currentProposalId += 1;
        approvalsForCurrentTranche = 0;
        oppositionsForCurrentTranche = 0;
        votesForCurrentTranche = 0;
        phase = Phase.AwaitingApproval;
        emit PayoutProposed(
            currentProposalId,
            currentTranche,
            recipient,
            amount,
            purpose,
            approvalMaterialHash,
            approvalMaterialUri
        );
    }

    function approvePayout() external nonReentrant {
        _castVote(true);
    }

    function opposePayout() external nonReentrant {
        _castVote(false);
    }

    function _castVote(bool inFavor) internal {
        require(phase == Phase.AwaitingApproval, "not awaiting approval");
        require(isDonor[msg.sender], "not a donor");
        require(
            !approvedForProposal[currentProposalId][msg.sender]
                && !opposedForProposal[currentProposalId][msg.sender],
            "already voted"
        );

        votesForCurrentTranche += 1;
        if (inFavor) {
            approvedForProposal[currentProposalId][msg.sender] = true;
            approvalsForCurrentTranche += 1;
            emit PayoutApproved(currentProposalId, currentTranche, msg.sender);
        } else {
            opposedForProposal[currentProposalId][msg.sender] = true;
            oppositionsForCurrentTranche += 1;
            emit PayoutOpposed(currentProposalId, currentTranche, msg.sender);
        }

        if (
            approvalsForCurrentTranche * 100 > donorCount * 50
                && oppositionsForCurrentTranche * 100 < donorCount * 30
        ) {
            phase = Phase.ReadyToDisburse;
        } else if (
            oppositionsForCurrentTranche * 100 >= donorCount * 30
                || votesForCurrentTranche == donorCount
        ) {
            emit PayoutRejected(
                currentProposalId,
                currentTranche,
                approvalsForCurrentTranche,
                oppositionsForCurrentTranche
            );
            phase = Phase.Funding;
            proposedAmount = 0;
            proposedRecipient = payable(address(0));
            delete proposedPurpose;
            delete proposedApprovalMaterialHash;
            delete proposedApprovalMaterialUri;
            approvalsForCurrentTranche = 0;
            oppositionsForCurrentTranche = 0;
            votesForCurrentTranche = 0;
        }
    }

    function executePayout() external onlyManager nonReentrant {
        require(phase == Phase.ReadyToDisburse, "voting thresholds not met");

        uint256 tranche = currentTranche;
        address payable recipient = proposedRecipient;
        uint256 amount = proposedAmount;
        phase = Phase.AwaitingExecutionReport;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "transfer failed");
        emit PayoutExecuted(tranche, recipient, amount);
    }

    function confirmExecution(bytes32 evidenceHash) external onlyManager nonReentrant {
        require(phase == Phase.AwaitingExecutionReport, "no payout to report");
        require(evidenceHash != bytes32(0), "empty evidence hash");

        uint256 completedTranche = currentTranche;
        lastExecutionEvidenceHash = evidenceHash;
        emit ExecutionReported(completedTranche, evidenceHash);

        currentTranche = completedTranche + 1;
        proposedAmount = 0;
        proposedRecipient = payable(address(0));
        delete proposedPurpose;
        delete proposedApprovalMaterialHash;
        delete proposedApprovalMaterialUri;
        approvalsForCurrentTranche = 0;
        oppositionsForCurrentTranche = 0;
        votesForCurrentTranche = 0;
        phase = Phase.Funding;
    }
}
