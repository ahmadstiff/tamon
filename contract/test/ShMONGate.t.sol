// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IShMON} from "../src/interfaces/IShMON.sol";

/// @notice THE GATE. Proves shMON actually works before a single line of Tamon is written.
///
/// If these tests do not pass, the staking integration gets cut and Tamon holds raw MON in
/// escrow instead. Everything else in the design survives that cut.
///
/// Run: forge test --fork-url https://testnet-rpc.monad.xyz --match-contract ShMONGate -vv
contract ShMONGateTest is Test {
    IShMON constant SHMON = IShMON(0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9);
    address constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @dev Required: redeem() sends native MON back to this contract.
    receive() external payable {}

    function setUp() public {
        vm.createSelectFork("monad_testnet");
    }

    /// @notice shMON is alive and is the ERC-7535 native-asset flavour we designed against.
    function test_gate_shmonIsLiveAndNativeAsset() public view {
        assertGt(address(SHMON).code.length, 0, "shMON has no code - wrong address or dead chain");
        assertEq(SHMON.asset(), NATIVE_SENTINEL, "not ERC-7535: asset() is not the native sentinel");
        assertGt(SHMON.totalAssets(), 0, "vault is empty");

        console2.log("totalAssets (MON)", SHMON.totalAssets() / 1e18);
        console2.log("totalSupply (shMON)", SHMON.totalSupply() / 1e18);
    }

    /// @notice The rate is ~11.73, NOT 1:1. This test exists to make that impossible to forget.
    function test_gate_rateIsNotOneToOne() public view {
        uint256 rate = SHMON.convertToAssets(1e18);
        console2.log("convertToAssets(1e18) =", rate);

        assertGt(rate, 1e18, "rate below parity - unexpected");
        assertGt(rate, 5e18, "rate collapsed far below the observed 11.73 - re-verify before building");
    }

    /// @notice The round trip. Deposit native MON, get shares, redeem shares, get MON back.
    function test_gate_depositRedeemRoundTrip() public {
        uint256 stake = 1 ether;
        vm.deal(address(this), stake);

        uint256 expectedShares = SHMON.previewDeposit(stake);
        uint256 shares = SHMON.deposit{value: stake}(stake, address(this));

        console2.log("deposited (wei)", stake);
        console2.log("shares received", shares);

        assertEq(shares, expectedShares, "previewDeposit disagreed with deposit");
        assertGt(shares, 0, "deposit minted nothing");
        assertEq(SHMON.balanceOf(address(this)), shares, "share balance mismatch");
        // At a rate of ~11.73, 1 MON buys ~0.085 shMON. Shares MUST be far below the MON amount.
        assertLt(shares, stake / 5, "shares suspiciously close to assets - is the rate really 1:1?");

        // Redemption must be within the vault's GLOBAL cap.
        uint256 cap = SHMON.maxRedeem(address(this));
        console2.log("maxRedeem (global cap)", cap);
        assertGe(cap, shares, "global redeem cap is below our position - clamp logic is mandatory");

        uint256 balBefore = address(this).balance;
        uint256 assetsOut = SHMON.redeem(shares, address(this), address(this));

        console2.log("MON returned", assetsOut);
        assertEq(address(this).balance - balBefore, assetsOut, "native MON did not arrive");
        assertEq(SHMON.balanceOf(address(this)), 0, "shares not fully burned");

        // Entry+exit spread is ~10bps. Expect to get back slightly less than deposited, not more.
        assertGt(assetsOut, (stake * 99) / 100, "lost more than 1% on a round trip");
        assertLe(assetsOut, stake, "round trip was profitable - impossible without time passing");
    }

    /// @notice deposit with value:0 must revert. Confirms msg.value is genuinely required.
    function test_gate_depositRequiresMsgValue() public {
        vm.expectRevert();
        SHMON.deposit(1 ether, address(this));
    }

    /// @notice Yield is real: the exchange rate strictly increases as blocks pass.
    ///
    /// Rolls BACKWARD then forward to the head. Rolling to `block.number + 5000` would ask for a
    /// block ~33 minutes in Monad's future (400ms blocks) and fail with a block-not-found RPC
    /// error — a harness bug that reads exactly like shMON being broken, and would wrongly trip
    /// the 2-hour gate into cutting the staking integration.
    ///
    /// Needs archive state ~33 minutes deep. This is the one gate assertion that may be dropped
    /// without cutting R2 — if the public RPC's retention is shorter, confirm rate appreciation
    /// with two separate runs instead.
    function test_gate_yieldAccrues() public {
        uint256 head = block.number;
        vm.createSelectFork("monad_testnet", head - 5_000);
        uint256 rateBefore = SHMON.convertToAssets(1e18);

        vm.rollFork(head);
        uint256 rateAfter = SHMON.convertToAssets(1e18);

        console2.log("rate before", rateBefore);
        console2.log("rate after ", rateAfter);
        assertGt(rateAfter, rateBefore, "no yield accrued over 5000 blocks");
    }
}
