// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Tamon} from "../src/Tamon.sol";
import {IShMON} from "../src/interfaces/IShMON.sol";

/// @notice Deploys Tamon to Monad testnet (chain 10143).
///
/// @dev The shMON address is verified on-chain, not taken from documentation. Monad testnet was
///      re-genesised on 2025-12-16, which wiped every previously published staking address — the
///      ones still circulating in blogs and older docs return empty code. This script asserts
///      the vault has code and looks like shMON before spending gas on a deployment that would
///      otherwise be bricked.
///
/// Usage (key never leaves the encrypted keystore in plaintext on disk):
///   PK=$(cast wallet decrypt-keystore --keystore-dir ~/.monskills/keystore <file> \
///        --unsafe-password "" | awk '{print $NF}')
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --private-key $PK --broadcast
contract Deploy is Script {
    address constant SHMON_TESTNET = 0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9;
    address constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function run() external returns (Tamon tamon) {
        address shmon = vm.envOr("SHMON_ADDRESS", SHMON_TESTNET);
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address owner = vm.envOr("OWNER_ADDRESS", msg.sender);

        require(shmon.code.length > 0, "shMON has no code - wrong address or chain");
        require(IShMON(shmon).asset() == NATIVE_SENTINEL, "not the ERC-7535 native vault");
        require(verifier != address(0), "verifier unset");

        console2.log("chain        ", block.chainid);
        console2.log("shMON        ", shmon);
        console2.log("verifier     ", verifier);
        console2.log("owner        ", owner);
        console2.log("shMON rate   ", IShMON(shmon).convertToAssets(1e18));

        vm.startBroadcast();
        tamon = new Tamon(IShMON(shmon), verifier, owner);
        vm.stopBroadcast();

        console2.log("Tamon        ", address(tamon));
    }
}
