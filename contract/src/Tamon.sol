// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IShMON} from "./interfaces/IShMON.sol";

/// @title Tamon — commitment staking with a decaying stone NFT
/// @notice Stake MON against a verifiable GitHub target. Hit it and you get principal + staking
///         yield + a share of everyone who missed. Miss it and your stake funds the people who
///         didn't. Every commitment is a soulbound NFT whose artwork weathers as the deadline
///         approaches, rendered entirely on-chain from block.timestamp.
///
/// @dev Two invariants carry this contract. Break either and funds are silently at risk:
///
///      1. Everything is denominated in shMON SHARES, never MON. The exchange rate is ~11.73
///         and rises every block; storing MON amounts would require snapshotting a moving rate.
///         Shares make yield accrue to whoever holds them, with no code.
///
///      2. `shares` and `weight` are different quantities and must never be swapped.
///         `shares` is principal — it drives claimableShares and the forfeited amount.
///         `weight` is the reward claim — it drives totalWeight, entryAcc, and _earned.
///         Weight is time-scaled so a 60-second commitment cannot capture the same prize
///         share as one that locked capital for 90 days.
contract Tamon is ERC721, EIP712, ReentrancyGuardTransient, Ownable {
    // ------------------------------------------------------------------ types

    enum State {
        None,
        Active,
        Succeeded,
        Failed
    }

    struct Commitment {
        uint128 shares; // shMON shares — principal
        uint128 weight; // shares * duration / MAX_DURATION — prize claim
        uint64 start;
        uint64 deadline;
        uint256 entryAcc; // accPerWeight snapshot at creation
        uint32 target;
        uint32 achieved; // written at settle from the signed payload
        State state;
        string repo; // validated at commit — see _validateRepo
    }

    // -------------------------------------------------------------- constants

    uint256 private constant RAY = 1e27;
    uint256 public constant MIN_STAKE = 0.1 ether;
    uint32 public constant MIN_TARGET = 1;
    uint64 public constant MIN_DURATION = 60;
    uint64 public constant MAX_DURATION = 90 days;
    uint256 public constant SLASH_FEE_BPS = 1000;
    uint256 private constant MAX_REPO_LEN = 100;

    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 tokenId,address owner,uint32 achieved,uint64 expiry)");

    IShMON public immutable SHMON;

    // ------------------------------------------------------------------ state

    mapping(uint256 => Commitment) public commitments;
    mapping(address => uint256) public claimableShares;
    mapping(address => uint32) public completedCount;
    mapping(address => uint256[]) private _ownedTokens;

    /// @notice Cumulative shMON shares distributed per unit of weight, RAY-scaled.
    uint256 public accPerWeight;
    /// @notice Sum of `weight` across all Active commitments. NOT a share quantity.
    uint256 public totalWeight;
    /// @notice Shares awaiting a distribution that had no eligible weight, plus rounding carry.
    uint256 public undistributed;

    uint256 public nextId = 1;
    address public verifier;

    // ----------------------------------------------------------------- events

    event Committed(
        uint256 indexed tokenId,
        address indexed owner,
        string repo,
        uint32 target,
        uint256 shares,
        uint64 deadline
    );
    event Settled(uint256 indexed tokenId, address indexed owner, uint32 achieved, uint256 payout);
    event Reaped(uint256 indexed tokenId, address indexed reaper, uint256 forfeited, uint256 distributed);
    event Withdrawn(address indexed owner, uint256 shares, uint256 monOut);
    event ExitedInKind(address indexed owner, uint256 shares);
    event VerifierChanged(address indexed previous, address indexed current);
    event MetadataUpdate(uint256 _tokenId); // ERC-4906

    // ----------------------------------------------------------------- errors

    error StakeTooSmall();
    error TargetTooSmall();
    error BadDuration();
    error BadRepo();
    error DepositFailed();
    error NotActive();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AttestationExpired();
    error TargetNotMet();
    error BadAttestation();
    error NothingWithdrawable();
    error SoulboundTransferDisabled();
    error UnknownToken();

    // ------------------------------------------------------------ constructor

    constructor(IShMON shmon, address initialVerifier, address initialOwner)
        ERC721("Tamon Stone", "STONE")
        EIP712("Tamon", "1")
        Ownable(initialOwner)
    {
        SHMON = shmon;
        verifier = initialVerifier;
        emit VerifierChanged(address(0), initialVerifier);
    }

    // ------------------------------------------------------------ commit (U3)

    /// @notice Stake MON against a GitHub target. Deposits into shMON and mints the stone.
    function commit(string calldata repo, uint32 target, uint64 duration)
        external
        payable
        nonReentrant
        returns (uint256 tokenId)
    {
        if (msg.value < MIN_STAKE) revert StakeTooSmall();
        if (target < MIN_TARGET) revert TargetTooSmall();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration();
        _validateRepo(repo);

        // ERC-7535: assets and msg.value must match; there is no approve path.
        uint256 shares = SHMON.deposit{value: msg.value}(msg.value, address(this));
        if (shares == 0) revert DepositFailed();
        // Bounds the uint128 packing below. Unreachable in practice (1 MON buys ~8.5e16 shares,
        // uint128 holds ~3.4e38) but a truncating cast here would silently destroy principal.
        if (shares > type(uint128).max) revert DepositFailed();

        // Time-scaled so a minimum-duration commitment cannot farm the prize pool.
        // weight <= shares always, so the uint128 bound above covers it too.
        uint256 weight = (shares * duration) / MAX_DURATION;
        if (weight == 0) weight = 1;

        tokenId = nextId++;
        commitments[tokenId] = Commitment({
            // casting to 'uint128' is safe because both are bounded above: shares is checked
            // against type(uint128).max, and weight <= shares by construction.
            // forge-lint: disable-next-line(unsafe-typecast)
            shares: uint128(shares),
            // forge-lint: disable-next-line(unsafe-typecast)
            weight: uint128(weight),
            start: uint64(block.timestamp),
            deadline: uint64(block.timestamp) + duration,
            entryAcc: accPerWeight,
            target: target,
            achieved: 0,
            state: State.Active,
            repo: repo
        });

        totalWeight += weight;
        _ownedTokens[msg.sender].push(tokenId);

        emit Committed(tokenId, msg.sender, repo, target, shares, uint64(block.timestamp) + duration);

        // Last: _safeMint hands control to the receiver via onERC721Received.
        _safeMint(msg.sender, tokenId);
    }

    /// @dev Charset alone is not enough. Requiring exactly one slash with non-traversal segments
    ///      stops `victim/repo/../../../repos/attacker/loaded` from being stored on-chain and
    ///      then interpolated into the backend's GitHub API path.
    function _validateRepo(string calldata repo) private pure {
        bytes calldata b = bytes(repo);
        uint256 len = b.length;
        if (len == 0 || len > MAX_REPO_LEN) revert BadRepo();

        uint256 slash = type(uint256).max;
        for (uint256 i; i < len; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= 0x41 && c <= 0x5A) // A-Z
                || (c >= 0x61 && c <= 0x7A) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x2D // -
                || c == 0x5F // _
                || c == 0x2E // .
                || c == 0x2F; // /
            if (!ok) revert BadRepo();
            if (c == 0x2F) {
                if (slash != type(uint256).max) revert BadRepo(); // second slash
                slash = i;
            }
        }
        if (slash == type(uint256).max) revert BadRepo(); // no slash
        if (slash == 0 || slash == len - 1) revert BadRepo(); // empty segment

        _rejectTraversal(b, 0, slash);
        _rejectTraversal(b, slash + 1, len);
    }

    /// @dev Rejects a segment that is exactly "." or "..".
    function _rejectTraversal(bytes calldata b, uint256 from, uint256 to) private pure {
        uint256 n = to - from;
        if (n == 1 && b[from] == 0x2E) revert BadRepo();
        if (n == 2 && b[from] == 0x2E && b[from + 1] == 0x2E) revert BadRepo();
    }

    // -------------------------------------------------- settle and reap (U4)

    /// @dev Prize earned by a commitment while its own capital was at risk.
    function _earned(Commitment storage c) private view returns (uint256) {
        return (uint256(c.weight) * (accPerWeight - c.entryAcc)) / RAY;
    }

    /// @notice Settle a met target with a verifier attestation. Permissionless by design.
    /// @dev `msg.sender` is deliberately absent from the signed struct and the payout goes to
    ///      ownerOf(tokenId), so copying a signature out of the mempool only pays the owner's
    ///      gas. Binding msg.sender instead would create a griefing surface with no upside.
    ///      No nonce: tokenId is globally unique and the Active guard makes each commitment
    ///      settleable exactly once, so a replayed signature reverts with NotActive.
    function settle(uint256 tokenId, uint32 achieved, uint64 expiry, bytes calldata signature) external {
        Commitment storage c = commitments[tokenId];
        if (c.state != State.Active) revert NotActive();
        if (block.timestamp > c.deadline) revert DeadlinePassed();
        if (block.timestamp > expiry) revert AttestationExpired();
        if (achieved < c.target) revert TargetNotMet();

        address owner = ownerOf(tokenId);
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ATTESTATION_TYPEHASH, tokenId, owner, achieved, expiry)));
        // v5 ECDSA.recover reverts on a malformed signature; an address(0) check would be dead code.
        if (ECDSA.recover(digest, signature) != verifier) revert BadAttestation();

        uint256 reward = _earned(c);
        totalWeight -= c.weight;

        c.state = State.Succeeded;
        c.achieved = achieved;

        uint256 payout = uint256(c.shares) + reward;
        claimableShares[owner] += payout;
        unchecked {
            ++completedCount[owner];
        }

        emit Settled(tokenId, owner, achieved, payout);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Sweep an expired commitment into the prize pool. Anyone may call this.
    function reap(uint256 tokenId) external {
        Commitment storage c = commitments[tokenId];
        if (c.state != State.Active) revert NotActive();
        if (block.timestamp <= c.deadline) revert DeadlineNotPassed();

        uint256 forfeit = uint256(c.shares) + _earned(c);

        // MUST precede the accPerWeight increment below. If this ran after, the failed
        // commitment would receive a slice of its own forfeiture and the accumulator would
        // promise more shares than the contract holds — silently, until someone cannot withdraw.
        totalWeight -= c.weight;

        c.state = State.Failed;

        // The fee is removed from circulation, not paid to anyone. Routing it to a
        // developer-controlled treasury would be a house rake, and this product's boundary is
        // that forfeited stake flows to other users. Deterrence is identical either way.
        uint256 fee = (forfeit * SLASH_FEE_BPS) / 10_000;
        uint256 dist = forfeit - fee + undistributed;

        if (totalWeight == 0) {
            undistributed = dist;
        } else {
            uint256 inc = (dist * RAY) / totalWeight;
            accPerWeight += inc;
            undistributed = dist - ((inc * totalWeight) / RAY); // carry the remainder
        }

        emit Reaped(tokenId, msg.sender, forfeit, dist);
        emit MetadataUpdate(tokenId);
    }

    // -------------------------------------------------------- exits (U6)

    /// @notice Redeem settled shares for native MON, clamped to what the vault can pay now.
    /// @dev Settlement never calls shMON, so entitlement is already recorded permanently by the
    ///      time anyone gets here. This function is the only place vault liquidity matters, and
    ///      it clamps rather than reverts so a user always drains as much as is available and
    ///      keeps the remainder claimable. shMON's maxRedeem is a GLOBAL vault ceiling shared
    ///      with every other user on the chain, not a per-owner limit.
    /// @param sharesRequested Upper bound; pass type(uint256).max to take whatever is available.
    function withdraw(uint256 sharesRequested)
        external
        nonReentrant
        returns (uint256 shares, uint256 monOut)
    {
        uint256 claimable = claimableShares[msg.sender];
        uint256 cap = SHMON.maxRedeem(address(this));

        shares = sharesRequested < claimable ? sharesRequested : claimable;
        if (cap < shares) shares = cap;
        if (shares == 0) revert NothingWithdrawable();

        claimableShares[msg.sender] -= shares; // effects before the external call
        // receiver is msg.sender, never address(this) — the contract has no receive() and must
        // never need one. That also blocks stray native donations from skewing the invariant.
        monOut = SHMON.redeem(shares, msg.sender, address(this));

        emit Withdrawn(msg.sender, shares, monOut);
    }

    /// @notice Take settled shares as shMON itself, bypassing the vault's redemption capacity.
    /// @dev The escape hatch behind R7. Anyone can exhaust the global redeem ceiling, which
    ///      would otherwise turn temporary illiquidity into a permanent lock. Five lines is a
    ///      cheap price for the guarantee that entitled funds are never trapped.
    function exitInKind(uint256 sharesRequested) external nonReentrant returns (uint256 shares) {
        uint256 claimable = claimableShares[msg.sender];
        shares = sharesRequested < claimable ? sharesRequested : claimable;
        if (shares == 0) revert NothingWithdrawable();

        claimableShares[msg.sender] -= shares;
        SHMON.transfer(msg.sender, shares);

        emit ExitedInKind(msg.sender, shares);
    }

    // ------------------------------------------------------------- views

    /// @notice Shares this user could redeem for MON right now — claimable, clamped by the
    ///         vault's global ceiling. Lower than claimableShares means "wait or exit in kind",
    ///         not "something failed"; the UI should say so.
    function withdrawableNow(address owner) external view returns (uint256) {
        uint256 claimable = claimableShares[owner];
        uint256 cap = SHMON.maxRedeem(address(this));
        return cap < claimable ? cap : claimable;
    }

    /// @notice The whole commitment in one call — the auto-generated getter returns a nine-field
    ///         tuple that is miserable to consume from tests or a frontend.
    function getCommitment(uint256 tokenId) external view returns (Commitment memory) {
        return commitments[tokenId];
    }

    function pendingReward(uint256 tokenId) external view returns (uint256) {
        Commitment storage c = commitments[tokenId];
        if (c.state != State.Active) return 0;
        return _earned(c);
    }

    function tokensOf(address owner) external view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    // ------------------------------------------------------------ admin

    function setVerifier(address newVerifier) external onlyOwner {
        emit VerifierChanged(verifier, newVerifier);
        verifier = newVerifier;
    }

    // ------------------------------------------------------------ soulbound

    /// @dev super._update returns the previous owner, so it must run first. Mint has
    ///      from == 0, burn has to == 0; anything else is a transfer and is blocked.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) revert SoulboundTransferDisabled();
        return from;
    }
}
