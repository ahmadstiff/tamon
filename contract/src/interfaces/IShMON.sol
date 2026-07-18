// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice FastLane shMonad (shMON) on Monad testnet: 0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9
///
/// shMON is ERC-7535 — a native-asset ERC-4626. `asset()` returns the native sentinel
/// 0xEeee...EEeE, and `deposit` is PAYABLE: it requires `msg.value == assets`. Calling it
/// with `value: 0` reverts. There is no ERC-20 approve path.
///
/// Verified on testnet (2026-07-18):
///   - Full SYNCHRONOUS 4626 surface. No requestRedeem/unbond/claim — redemption is instant.
///   - convertToAssets(1e18) == 11.73e18. The rate is NOT 1:1 and rises every block.
///     Anything that assumes 1 shMON == 1 MON is wrong by ~11.7x.
///   - maxRedeem returns a GLOBAL vault cap (~15.3 shMON), not a per-user limit. Exceeding
///     it reverts with ERC4626ExceededMaxRedeem. Always read it before redeeming.
interface IShMON {
    /// @dev PAYABLE. Requires msg.value == assets. Returns shares minted.
    function deposit(uint256 assets, address receiver) external payable returns (uint256 shares);

    /// @dev Burns `shares` from `owner`, sends native MON to `receiver`. Returns assets sent.
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    /// @dev Global vault ceiling, not per-owner. See note above.
    function maxRedeem(address owner) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);

    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function convertToShares(uint256 assets) external view returns (uint256 shares);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function previewRedeem(uint256 shares) external view returns (uint256 assets);

    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function totalSupply() external view returns (uint256);
}
