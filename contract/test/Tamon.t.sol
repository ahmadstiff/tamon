// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Tamon} from "../src/Tamon.sol";
import {IShMON} from "../src/interfaces/IShMON.sol";

/// @notice U3/U4 coverage. Runs against REAL shMON on a Monad testnet fork rather than a mock,
///         so the ~11.73 exchange rate is exercised for real and a 1:1 assumption cannot creep
///         back in unnoticed.
contract TamonTest is Test {
    IShMON constant SHMON = IShMON(0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9);

    Tamon tamon;
    uint256 verifierKey = 0xA11CE;
    address verifier;
    address owner = address(0xB0B);

    address alice = address(0xA1);
    address bob = address(0xB2);
    address carol = address(0xC3);

    bytes32 constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 tokenId,address owner,uint32 achieved,uint64 expiry)");

    function setUp() public {
        vm.createSelectFork("monad_testnet");
        verifier = vm.addr(verifierKey);
        tamon = new Tamon(SHMON, verifier, owner);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ------------------------------------------------------------- helpers

    function _commit(address who, uint256 stake, uint64 duration, uint32 target)
        internal
        returns (uint256 tokenId)
    {
        vm.prank(who);
        tokenId = tamon.commit{value: stake}("acme/widget", target, duration);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("Tamon")),
                keccak256(bytes("1")),
                block.chainid,
                address(tamon)
            )
        );
    }

    function _sign(uint256 key, uint256 tokenId, address tokenOwner, uint32 achieved, uint64 expiry)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(ATTESTATION_TYPEHASH, tokenId, tokenOwner, achieved, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _settle(uint256 tokenId, address tokenOwner, uint32 achieved) internal {
        uint64 expiry = uint64(block.timestamp + 10 minutes);
        tamon.settle(tokenId, achieved, expiry, _sign(verifierKey, tokenId, tokenOwner, achieved, expiry));
    }

    function _shares(uint256 tokenId) internal view returns (uint256) {
        return tamon.getCommitment(tokenId).shares;
    }

    function _weight(uint256 tokenId) internal view returns (uint256) {
        return tamon.getCommitment(tokenId).weight;
    }

    function _state(uint256 tokenId) internal view returns (Tamon.State) {
        return tamon.getCommitment(tokenId).state;
    }

    // ------------------------------------------------------------ U3 commit

    function test_commit_mintsAndAccountsShares() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);

        assertEq(tokenId, 1, "first token id");
        assertEq(tamon.ownerOf(tokenId), alice, "owner");
        assertGt(_shares(tokenId), 0, "shares minted");
        assertEq(tamon.totalWeight(), _weight(tokenId), "totalWeight tracks weight not shares");
        assertEq(uint8(_state(tokenId)), uint8(Tamon.State.Active), "active");

        // At the ~11.73 rate, 1 MON buys ~0.085 shMON. Guards against a 1:1 regression.
        assertLt(_shares(tokenId), 1 ether / 5, "shares suspiciously close to assets");
    }

    function test_commit_weightIsTimeScaled() public {
        uint256 shortId = _commit(alice, 1 ether, 60, 1);
        uint256 longId = _commit(bob, 1 ether, 30 days, 1);

        // KTD10: the whole point is that a 60-second stake cannot buy the same prize claim.
        assertLt(_weight(shortId) * 1000, _weight(longId), "short commitment weight not suppressed");
    }

    function test_commit_weightNeverZero() public {
        uint256 tokenId = _commit(alice, tamon.MIN_STAKE(), 60, 1);
        assertGe(_weight(tokenId), 1, "weight floored at 1");
    }

    function test_commit_tracksOwnedTokens() public {
        uint256 a = _commit(alice, 1 ether, 7 days, 10);
        uint256 b = _commit(alice, 1 ether, 7 days, 10);

        uint256[] memory owned = tamon.tokensOf(alice);
        assertEq(owned.length, 2);
        assertEq(owned[0], a);
        assertEq(owned[1], b);
        assertTrue(a != b, "distinct token ids");
    }

    function test_commit_revertsBelowMinStake() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.StakeTooSmall.selector);
        tamon.commit{value: 0.01 ether}("acme/widget", 1, 7 days);
    }

    function test_commit_revertsOnZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.StakeTooSmall.selector);
        tamon.commit{value: 0}("acme/widget", 1, 7 days);
    }

    function test_commit_revertsOnZeroTarget() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.TargetTooSmall.selector);
        tamon.commit{value: 1 ether}("acme/widget", 0, 7 days);
    }

    function test_commit_revertsOnDurationOutOfRange() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.BadDuration.selector);
        tamon.commit{value: 1 ether}("acme/widget", 1, 59);

        vm.prank(alice);
        vm.expectRevert(Tamon.BadDuration.selector);
        tamon.commit{value: 1 ether}("acme/widget", 1, 91 days);
    }

    function test_commit_acceptsValidRepo() public {
        vm.prank(alice);
        uint256 tokenId = tamon.commit{value: 1 ether}("user/my-repo.js", 1, 7 days);
        assertEq(tokenId, 1);
    }

    /// @dev Each of these would corrupt the JSON metadata or redirect the backend's API path.
    function test_commit_revertsOnMalformedRepo() public {
        string[9] memory bad = [
            'acme/wid"get', // double quote breaks JSON
            "acme/wid\\get", // backslash breaks JSON
            "acme/wid\nget", // newline breaks JSON
            "acme/wid get", // space
            "", // empty
            "acmewidget", // no slash
            "acme/sub/widget", // two slashes
            "../widget", // traversal, left segment
            "acme/.." // traversal, right segment
        ];

        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(Tamon.BadRepo.selector);
            tamon.commit{value: 1 ether}(bad[i], 1, 7 days);
        }
    }

    function test_commit_revertsOnOverlongRepo() public {
        string memory long = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        vm.prank(alice);
        vm.expectRevert(Tamon.BadRepo.selector);
        tamon.commit{value: 1 ether}(long, 1, 7 days);
    }

    // ------------------------------------------------------------ U4 settle

    function test_settle_creditsOwnerAndCountsCompletion() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        uint256 shares = _shares(tokenId);

        _settle(tokenId, alice, 12);

        assertEq(uint8(_state(tokenId)), uint8(Tamon.State.Succeeded));
        assertEq(tamon.claimableShares(alice), shares, "principal returned");
        assertEq(tamon.completedCount(alice), 1, "completion counted");
        assertEq(tamon.totalWeight(), 0, "weight released");
    }

    /// @dev Payout targets ownerOf, so a third party relaying the signature only spends gas.
    function test_settle_isPermissionlessAndPaysOwner() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);

        vm.prank(carol);
        _settle(tokenId, alice, 10);

        assertGt(tamon.claimableShares(alice), 0, "owner paid");
        assertEq(tamon.claimableShares(carol), 0, "relayer paid nothing");
    }

    function test_settle_revertsWhenTargetNotMet() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        uint64 expiry = uint64(block.timestamp + 10 minutes);

        vm.expectRevert(Tamon.TargetNotMet.selector);
        tamon.settle(tokenId, 9, expiry, _sign(verifierKey, tokenId, alice, 9, expiry));
    }

    function test_settle_revertsOneSecondAfterDeadline() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days + 1);

        uint64 expiry = uint64(block.timestamp + 10 minutes);
        vm.expectRevert(Tamon.DeadlinePassed.selector);
        tamon.settle(tokenId, 10, expiry, _sign(verifierKey, tokenId, alice, 10, expiry));
    }

    function test_settle_succeedsOneSecondBeforeDeadline() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days - 1);

        _settle(tokenId, alice, 10);
        assertEq(uint8(_state(tokenId)), uint8(Tamon.State.Succeeded));
    }

    function test_settle_revertsOnWrongSigner() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        uint64 expiry = uint64(block.timestamp + 10 minutes);

        vm.expectRevert(Tamon.BadAttestation.selector);
        tamon.settle(tokenId, 10, expiry, _sign(0xBADBAD, tokenId, alice, 10, expiry));
    }

    function test_settle_revertsOnExpiredAttestation() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        uint64 expiry = uint64(block.timestamp + 10 minutes);
        bytes memory sig = _sign(verifierKey, tokenId, alice, 10, expiry);

        vm.warp(block.timestamp + 11 minutes);
        vm.expectRevert(Tamon.AttestationExpired.selector);
        tamon.settle(tokenId, 10, expiry, sig);
    }

    /// @dev Replay protection without a nonce: the Active guard makes each token settle once.
    function test_settle_revertsOnReplay() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        uint64 expiry = uint64(block.timestamp + 10 minutes);
        bytes memory sig = _sign(verifierKey, tokenId, alice, 10, expiry);

        tamon.settle(tokenId, 10, expiry, sig);
        vm.expectRevert(Tamon.NotActive.selector);
        tamon.settle(tokenId, 10, expiry, sig);
    }

    /// @dev The finding that motivated binding tokenId+owner into the struct: without it, one
    ///      attestation would settle every commitment the holder owns for its whole validity.
    function test_settle_revertsWhenSignatureIsReusedOnAnotherToken() public {
        uint256 a = _commit(alice, 1 ether, 7 days, 10);
        uint256 b = _commit(alice, 1 ether, 7 days, 10);

        uint64 expiry = uint64(block.timestamp + 10 minutes);
        bytes memory sigForA = _sign(verifierKey, a, alice, 10, expiry);

        vm.expectRevert(Tamon.BadAttestation.selector);
        tamon.settle(b, 10, expiry, sigForA);
    }

    // -------------------------------------------------------------- U4 reap

    function test_reap_revertsBeforeDeadline() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        vm.expectRevert(Tamon.DeadlineNotPassed.selector);
        tamon.reap(tokenId);
    }

    function test_reap_revertsTwice() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days + 1);

        tamon.reap(tokenId);
        vm.expectRevert(Tamon.NotActive.selector);
        tamon.reap(tokenId);
    }

    function test_reap_distributesForfeitMinusFee() public {
        uint256 loser = _commit(alice, 1 ether, 7 days, 10);
        _commit(bob, 1 ether, 7 days, 10); // keeps totalWeight non-zero

        uint256 forfeit = _shares(loser);
        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(loser);

        assertEq(uint8(_state(loser)), uint8(Tamon.State.Failed));
        assertGt(tamon.accPerWeight(), 0, "accumulator advanced");

        // 10% is removed from circulation, not paid to anyone.
        uint256 expectedDist = forfeit - (forfeit * tamon.SLASH_FEE_BPS()) / 10_000;
        uint256 distributed = (tamon.accPerWeight() * tamon.totalWeight()) / 1e27 + tamon.undistributed();
        assertApproxEqAbs(distributed, expectedDist, 2, "distributed == forfeit - fee");
    }

    /// @dev THE regression test. If `totalWeight -= c.weight` ran after the accumulator
    ///      increment, the failed commitment would earn a slice of its own forfeiture and the
    ///      contract would promise more shares than it holds — silently.
    function test_reap_failedCommitmentEarnsNothingFromItsOwnForfeiture() public {
        uint256 loser = _commit(alice, 3 ether, 7 days, 10);
        uint256 w1 = _commit(bob, 1 ether, 7 days, 10);
        uint256 w2 = _commit(carol, 1 ether, 7 days, 10);

        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(loser);

        assertEq(tamon.pendingReward(loser), 0, "failed commitment must earn zero");

        uint256 forfeit = _shares(loser);
        uint256 expectedDist = forfeit - (forfeit * tamon.SLASH_FEE_BPS()) / 10_000;
        uint256 shared = tamon.pendingReward(w1) + tamon.pendingReward(w2) + tamon.undistributed();
        assertApproxEqAbs(shared, expectedDist, 3, "survivors share exactly the distribution");
    }

    function test_reap_withNoActiveWeightParksInUndistributed() public {
        uint256 lone = _commit(alice, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days + 1);

        tamon.reap(lone);

        assertEq(tamon.accPerWeight(), 0, "no eligible weight, no distribution");
        assertGt(tamon.undistributed(), 0, "parked instead of stranded");
    }

    function test_reap_carriesUndistributedIntoNextDistribution() public {
        uint256 lone = _commit(alice, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(lone);

        uint256 parked = tamon.undistributed();
        assertGt(parked, 0);

        uint256 second = _commit(bob, 1 ether, 7 days, 10);
        uint256 survivor = _commit(carol, 1 ether, 7 days, 10);
        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(second);

        // The parked shares reached the survivor rather than being stranded forever.
        assertGt(tamon.pendingReward(survivor), 0, "carry forward reached an eligible holder");
    }

    /// @dev KTD10 in action: a 60-second sniper must not capture a meaningful prize slice.
    function test_reap_shortCommitmentCannotSnipeThePool() public {
        uint256 patient = _commit(bob, 1 ether, 30 days, 1);
        uint256 sniper = _commit(carol, 1 ether, 60, 1);
        uint256 loser = _commit(alice, 5 ether, 7 days, 10);

        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(loser);

        uint256 sniped = tamon.pendingReward(sniper);
        uint256 earned = tamon.pendingReward(patient);
        assertGt(earned, sniped * 1000, "time-weighting failed: sniping is still profitable");
    }

    // -------------------------------------------------------- U6 exits

    function test_withdraw_returnsMonAndClearsClaim() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        _settle(tokenId, alice, 10);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        (uint256 shares, uint256 monOut) = tamon.withdraw(type(uint256).max);

        assertGt(shares, 0, "shares redeemed");
        assertEq(alice.balance - balBefore, monOut, "native MON arrived");
        assertEq(tamon.claimableShares(alice), 0, "claim cleared");
        // Round trip costs ~0.05% in vault spread; principal must come back nearly whole.
        assertGt(monOut, 0.99 ether, "lost more than 1% round tripping");
    }

    function test_withdraw_isIncrementalAndDrains() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        _settle(tokenId, alice, 10);

        uint256 claim = tamon.claimableShares(alice);

        vm.prank(alice);
        tamon.withdraw(claim / 2);
        assertApproxEqAbs(tamon.claimableShares(alice), claim - claim / 2, 1, "half remains");

        vm.prank(alice);
        tamon.withdraw(type(uint256).max);
        assertEq(tamon.claimableShares(alice), 0, "fully drained");
    }

    function test_withdraw_revertsWithNothingClaimable() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.NothingWithdrawable.selector);
        tamon.withdraw(type(uint256).max);
    }

    /// @dev The R7 escape hatch: entitled funds leave as the bearing asset even if the vault's
    ///      global redemption capacity is exhausted by unrelated users.
    function test_exitInKind_transfersShMonDirectly() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        _settle(tokenId, alice, 10);

        uint256 claim = tamon.claimableShares(alice);
        vm.prank(alice);
        uint256 shares = tamon.exitInKind(type(uint256).max);

        assertEq(shares, claim, "took the full claim");
        assertEq(SHMON.balanceOf(alice), claim, "shMON landed with the user");
        assertEq(tamon.claimableShares(alice), 0, "claim cleared");
    }

    function test_exitInKind_revertsWithNothingClaimable() public {
        vm.prank(alice);
        vm.expectRevert(Tamon.NothingWithdrawable.selector);
        tamon.exitInKind(type(uint256).max);
    }

    function test_withdrawableNow_neverExceedsClaim() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);
        _settle(tokenId, alice, 10);

        assertLe(tamon.withdrawableNow(alice), tamon.claimableShares(alice), "clamped by claim");
        assertGt(tamon.withdrawableNow(alice), 0, "vault has headroom at demo scale");
    }

    /// @dev No receive(): redeem sends native straight to the user, so the contract never needs
    ///      to accept MON. This also stops stray donations from skewing the solvency invariant.
    function test_contract_rejectsDirectNativeTransfer() public {
        vm.prank(alice);
        (bool ok,) = address(tamon).call{value: 1 ether}("");
        assertFalse(ok, "contract must not accept native MON");
    }

    // ---------------------------------------------------------- soulbound

    function test_transfer_isBlocked() public {
        uint256 tokenId = _commit(alice, 1 ether, 7 days, 10);

        vm.prank(alice);
        vm.expectRevert(Tamon.SoulboundTransferDisabled.selector);
        tamon.transferFrom(alice, bob, tokenId);
    }

    // -------------------------------------------------------------- admin

    function test_setVerifier_onlyOwner() public {
        vm.prank(owner);
        tamon.setVerifier(address(0xFEED));
        assertEq(tamon.verifier(), address(0xFEED));

        vm.prank(alice);
        vm.expectRevert();
        tamon.setVerifier(alice);
    }
}
