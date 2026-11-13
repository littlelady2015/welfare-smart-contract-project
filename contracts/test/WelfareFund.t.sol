// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/WelfareFund.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
}

contract WelfareFundTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    WelfareFund private fund;
    address private constant DONOR_A = address(0xA1);
    address private constant DONOR_B = address(0xB2);
    bytes32 private constant MATERIAL_HASH = keccak256("approval-material");
    string private constant MATERIAL_URI = "/evidence/procurement-quotation.svg";
    string private constant PURPOSE = "Procurement of water filtration equipment for three schools";

    receive() external payable {}

    function setUp() public {
        fund = new WelfareFund(address(this));
        vm.deal(DONOR_A, 2 ether);
        vm.deal(DONOR_B, 2 ether);

        vm.prank(DONOR_A);
        fund.deposit{value: 1 ether}();
        vm.prank(DONOR_B);
        fund.deposit{value: 1 ether}();
    }

    function testThresholdApprovalAndExecutionReportBeforeNextTranche() public {
        fund.proposePayout(payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI);
        vm.prank(DONOR_A);
        fund.approvePayout();
        require(fund.phase() == WelfareFund.Phase.AwaitingApproval, "one vote is enough");

        vm.prank(DONOR_B);
        fund.approvePayout();
        require(fund.phase() == WelfareFund.Phase.ReadyToDisburse, "approval threshold not reached");

        fund.executePayout();
        require(fund.phase() == WelfareFund.Phase.AwaitingExecutionReport, "payout not sent");

        (bool canSkipReport, ) = address(fund).call(
            abi.encodeCall(
                fund.proposePayout,
                (payable(address(this)), 0.1 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI)
            )
        );
        require(!canSkipReport, "next payout opened before execution report");

        fund.confirmExecution(keccak256("receipt-1"));
        require(fund.phase() == WelfareFund.Phase.Funding, "next tranche not opened");
        require(fund.currentTranche() == 2, "tranche counter not advanced");
        require(fund.proposedApprovalMaterialHash() == bytes32(0), "approval material not cleared");
    }

    function testRequiresMoreThanHalfApprovalAndLessThanThirtyPercentOpposition() public {
        (WelfareFund testFund, address[] memory shareholders) = _fundWithDonors(4);
        testFund.proposePayout(payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI);

        _vote(testFund, shareholders[0], true);
        _vote(testFund, shareholders[1], true);
        require(testFund.phase() == WelfareFund.Phase.AwaitingApproval, "exactly 50% passed");

        _vote(testFund, shareholders[2], false);
        require(testFund.phase() == WelfareFund.Phase.AwaitingApproval, "25% opposition rejected");

        _vote(testFund, shareholders[3], true);
        require(testFund.phase() == WelfareFund.Phase.ReadyToDisburse, "valid threshold not met");
    }

    function testThirtyPercentOppositionRejectsProposal() public {
        (WelfareFund testFund, address[] memory shareholders) = _fundWithDonors(10);
        testFund.proposePayout(payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI);

        _vote(testFund, shareholders[0], false);
        _vote(testFund, shareholders[1], false);
        require(testFund.phase() == WelfareFund.Phase.AwaitingApproval, "20% opposition rejected");
        _vote(testFund, shareholders[2], false);

        require(testFund.phase() == WelfareFund.Phase.Funding, "30% opposition did not reject");
        require(testFund.proposedAmount() == 0, "rejected amount was not cleared");
        require(testFund.proposedApprovalMaterialHash() == bytes32(0), "rejected material was not cleared");
        require(testFund.currentTranche() == 1, "rejection advanced the tranche");
    }

    function testShareholderCannotVoteTwiceOnOneProposal() public {
        fund.proposePayout(payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI);
        vm.prank(DONOR_A);
        fund.approvePayout();

        vm.prank(DONOR_A);
        (bool secondVoteSucceeded, ) = address(fund).call(
            abi.encodeCall(fund.opposePayout, ())
        );

        require(!secondVoteSucceeded, "shareholder voted twice");
        require(fund.approvalsForCurrentTranche() == 1, "approval count changed");
        require(fund.oppositionsForCurrentTranche() == 0, "opposition count changed");
    }

    function testProposalRequiresApprovalMaterial() public {
        (bool noHashSucceeded, ) = address(fund).call(
            abi.encodeCall(
                fund.proposePayout,
                (payable(address(this)), 0.5 ether, PURPOSE, bytes32(0), MATERIAL_URI)
            )
        );
        require(!noHashSucceeded, "proposal accepted without material hash");

        (bool noUriSucceeded, ) = address(fund).call(
            abi.encodeCall(
                fund.proposePayout,
                (payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, "")
            )
        );
        require(!noUriSucceeded, "proposal accepted without material uri");
    }

    function testCannotProposeAboveContractBalance() public {
        (bool succeeded, ) = address(fund).call(
            abi.encodeCall(
                fund.proposePayout,
                (payable(address(this)), 3 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI)
            )
        );
        require(!succeeded, "proposal exceeded contract balance");
        require(fund.currentProposalId() == 0, "invalid proposal changed proposal id");
    }

    function testCannotExecuteBeforeBothThresholdsAreMet() public {
        fund.proposePayout(payable(address(this)), 0.5 ether, PURPOSE, MATERIAL_HASH, MATERIAL_URI);

        (bool succeeded, ) = address(fund).call(abi.encodeCall(fund.executePayout, ()));
        require(!succeeded, "payout executed before approval");
        require(fund.phase() == WelfareFund.Phase.AwaitingApproval, "invalid execution changed phase");
    }

    function _fundWithDonors(uint256 count)
        private
        returns (WelfareFund testFund, address[] memory shareholders)
    {
        testFund = new WelfareFund(address(this));
        shareholders = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            address shareholder = address(uint160(0x1000 + i));
            shareholders[i] = shareholder;
            vm.deal(shareholder, 1 ether);
            vm.prank(shareholder);
            testFund.deposit{value: 1 ether}();
        }
    }

    function _vote(WelfareFund target, address shareholder, bool inFavor) private {
        vm.prank(shareholder);
        if (inFavor) {
            target.approvePayout();
        } else {
            target.opposePayout();
        }
    }
}
