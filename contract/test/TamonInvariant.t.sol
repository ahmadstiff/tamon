// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Tamon} from "../src/Tamon.sol";
import {IShMON} from "../src/interfaces/IShMON.sol";

/// @notice U5 — the contract must never owe more shMON shares than it holds.
///
/// @dev Deliberately a scripted sequence rather than a randomized stateful harness. These tests
///      run against a real Monad testnet fork, so every call is a network round trip and a
///      fuzzing handler would cost hours for coverage this reaches directly. The specific
///      failure mode being guarded — the totalWeight ordering in reap — is deterministic, and
///      the sequences below drive it from several directions.
///
///      The invariant deliberately does NOT include totalWeight. After time-weighting,
///      totalWeight is a sum of weights (capital x time), not a share quantity; adding it here
///      would mix two units and produce a meaningless comparison. The share-denominated
///      liability is the principal of active commitments, summed separately.
contract TamonInvariantTest is Test {
    IShMON constant SHMON = IShMON(0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9);

    Tamon tamon;
    uint256 verifierKey = 0xA11CE;
    address verifier;

    address[3] actors = [address(0xA1), address(0xB2), address(0xC3)];

    bytes32 constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 tokenId,address owner,uint32 achieved,uint64 expiry)");

    function setUp() public {
        vm.createSelectFork("monad_testnet");
        verifier = vm.addr(verifierKey);
        tamon = new Tamon(SHMON, verifier, address(this));

        for (uint256 i; i < actors.length; ++i) {
            vm.deal(actors[i], 1000 ether);
        }
    }

    // ------------------------------------------------------------- invariant

    /// @dev Holds with >= rather than == because every division floors in the contract's
    ///      favour, and the slash fee is intentionally removed from circulation. Both accrete
    ///      as unclaimable dust, which is a surplus, never a deficit.
    function _assertSolvent(string memory label) internal view {
        uint256 held = SHMON.balanceOf(address(tamon));
        uint256 owed;

        uint256 last = tamon.nextId();
        for (uint256 id = 1; id < last; ++id) {
            Tamon.Commitment memory c = tamon.getCommitment(id);
            if (c.state == Tamon.State.Active) {
                owed += c.shares; // principal
                owed += tamon.pendingReward(id); // accrued prize claim
            }
        }
        for (uint256 i; i < actors.length; ++i) {
            owed += tamon.claimableShares(actors[i]);
        }
        owed += tamon.undistributed();

        assertGe(held, owed, label);
    }

    // --------------------------------------------------------------- helpers

    function _commit(address who, uint256 stake, uint64 duration) internal returns (uint256 id) {
        vm.prank(who);
        id = tamon.commit{value: stake}("acme/widget", 1, duration);
    }

    function _settle(uint256 tokenId, address tokenOwner) internal {
        uint64 expiry = uint64(block.timestamp + 10 minutes);
        bytes32 structHash =
            keccak256(abi.encode(ATTESTATION_TYPEHASH, tokenId, tokenOwner, uint32(5), expiry));
        bytes32 domain = keccak256(
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
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(verifierKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        tamon.settle(tokenId, 5, expiry, abi.encodePacked(r, s, v));
    }

    function _drainAll() internal {
        for (uint256 i; i < actors.length; ++i) {
            if (tamon.claimableShares(actors[i]) == 0) continue;
            vm.prank(actors[i]);
            tamon.withdraw(type(uint256).max);
        }
    }

    // ----------------------------------------------------------------- tests

    function test_invariant_holdsAcrossMixedLifecycle() public {
        _assertSolvent("empty");

        uint256 a = _commit(actors[0], 5 ether, 30 days);
        _assertSolvent("after first commit");

        uint256 b = _commit(actors[1], 2 ether, 7 days);
        // Outlives b's deadline on purpose, so it can still settle after b is reaped — that
        // ordering (reap first, settle second) is the only one that pays a prize share.
        uint256 c = _commit(actors[2], 1 ether, 30 days);
        _assertSolvent("after three commits");

        _settle(a, actors[0]);
        _assertSolvent("after a settles");

        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(b);
        _assertSolvent("after b is reaped");

        _settle(c, actors[2]);
        _assertSolvent("after c settles late");

        _drainAll();
        _assertSolvent("after everyone withdraws");
    }

    function test_invariant_holdsWhenEveryCommitmentFails() public {
        uint256 a = _commit(actors[0], 3 ether, 7 days);
        uint256 b = _commit(actors[1], 1 ether, 7 days);

        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(a);
        _assertSolvent("first failure");
        tamon.reap(b);
        _assertSolvent("total wipeout");

        // Nobody was eligible for the last distribution, so it parks instead of stranding.
        assertGt(tamon.undistributed(), 0, "final forfeit parked");
    }

    function test_invariant_holdsWhenEveryCommitmentSucceeds() public {
        uint256 a = _commit(actors[0], 1 ether, 7 days);
        uint256 b = _commit(actors[1], 1 ether, 7 days);

        _settle(a, actors[0]);
        _settle(b, actors[1]);
        _assertSolvent("all succeeded");

        _drainAll();
        _assertSolvent("all withdrawn");
    }

    /// @dev totalWeight reaching zero and rising again is the edge the accumulator's
    ///      undistributed carry exists for.
    function test_invariant_holdsWhenWeightDrainsToZeroAndReturns() public {
        uint256 a = _commit(actors[0], 1 ether, 7 days);
        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(a);
        assertEq(tamon.totalWeight(), 0, "weight drained");
        _assertSolvent("weight at zero");

        uint256 b = _commit(actors[1], 2 ether, 30 days);
        _assertSolvent("weight returned");

        uint256 c = _commit(actors[2], 1 ether, 7 days);
        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(c);
        _assertSolvent("distribution after refill");

        // The parked shares from the first reap reached the holder who was active later.
        assertGt(tamon.pendingReward(b), 0, "carry forward paid out");
    }

    function test_invariant_holdsUnderVaryingStakesAndDurations(uint96 stakeSeed, uint32 durSeed) public {
        uint256 stake = bound(uint256(stakeSeed), tamon.MIN_STAKE(), 50 ether);
        uint64 duration = uint64(bound(uint256(durSeed), 60, 90 days));

        uint256 a = _commit(actors[0], stake, duration);
        uint256 b = _commit(actors[1], tamon.MIN_STAKE(), 90 days);
        _assertSolvent("fuzzed commits");

        vm.warp(block.timestamp + duration + 1);
        tamon.reap(a);
        _assertSolvent("fuzzed reap");

        assertEq(tamon.pendingReward(a), 0, "failed commitment earns nothing from itself");
        _assertSolvent("post-check");
        assertGt(tamon.pendingReward(b) + tamon.undistributed(), 0, "distribution landed somewhere");
    }

    /// @dev Residual dust is expected — floored divisions and the burnt slash fee both stay
    ///      behind. What must never happen is the balance dropping below what is owed.
    function test_invariant_residualIsDustNotDeficit() public {
        uint256 a = _commit(actors[0], 1 ether, 7 days);
        uint256 b = _commit(actors[1], 1 ether, 30 days); // must outlive a to settle after it

        vm.warp(block.timestamp + 7 days + 1);
        tamon.reap(a);
        _settle(b, actors[1]);
        _drainAll();

        _assertSolvent("post-drain");
        // The burnt fee is ~10% of one stake; everything else left over is rounding dust.
        uint256 residual = SHMON.balanceOf(address(tamon));
        assertLt(residual, tamon.getCommitment(a).shares, "residual bounded by the burnt fee");
    }
}
