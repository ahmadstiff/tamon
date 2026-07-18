// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TamonArt
/// @notice Fully on-chain SVG for Tamon stones. No external refs, no <image>, no fonts.
/// @dev    Every attribute uses SINGLE quotes so the whole string can be embedded
///         inside a double-quoted JSON metadata value without escaping.
///         GENERATED FILE - edit build_assets.py (palette dict) and regenerate.
///
/// Palette (A4) - one accent only:
///   BG       #0E1014  latar gelap
///   STONE    #6E7480  isi batu (netral mineral)
///   CRACK    #262A31  garis retakan
///   CRACK_D  #1A1D22  retakan tegas
///   FACET    #8F959F  highlight (turunan STONE)
///   ACCENT   #E8B23A  AKSEN TUNGGAL: kristal / badge emas / tombol utama
///   TXT1     #F2F0EC  teks primer
///   TXT2     #8A8F99  teks sekunder
///   BRONZE   #8A5A2B  tier metal
///   SILVER   #C8CDD4  tier metal
library TamonArt {
    // ---------------------------------------------------------------- state
    uint8 internal constant UTUH = 0;    // active, elapsed < 50%
    uint8 internal constant LAPUK = 1;   // active, 50-80%
    uint8 internal constant RETAK = 2;   // active, >= 80%
    uint8 internal constant HANCUR = 3;  // failed
    uint8 internal constant KRISTAL = 4; // succeeded

    // ---------------------------------------------------------------- chrome
    string internal constant HEAD = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='400' height='400' fill='#0E1014'/>";
    string internal constant BASE = "<path d='M98 183L142 97L236 81L308 139L318 235L262 313L162 319L82 249Z' fill='#6E7480' stroke='#262A31' stroke-width='5'/>";   // A1
    string internal constant TAIL = "</svg>";

    // ------------------------------------------------------------ A2 layers
    string internal constant L_UTUH    = "<path d='M124 172L160 110L230 98L186 174Z' fill='#8F959F' opacity='.55'/>";
    string internal constant L_LAPUK   = "<path d='M152 126L170 178L156 232M216 106L230 158' fill='none' stroke='#262A31' stroke-width='3' opacity='.6'/>";
    string internal constant L_RETAK   = "<path d='M150 118L172 176L154 234L174 290M216 100L230 156L208 208M262 134L248 192L270 246M120 206L158 224' fill='none' stroke='#1A1D22' stroke-width='4'/>";
    string internal constant L_HANCUR  = "<path d='M190 81L212 200L188 319L156 318L184 198L162 90ZM260 96L242 200L262 312L282 306L262 200L280 108Z' fill='#0E1014'/><path d='M92 336L120 326L108 354ZM286 342L312 330L300 358Z' fill='#6E7480'/>";
    string internal constant L_KRISTAL = "<path d='M200 94L288 150L260 248L162 270L108 188Z' fill='#E8B23A' opacity='.9'/><path d='M200 94L162 270M108 188L288 150M200 94L260 248' fill='none' stroke='#0E1014' stroke-width='3' opacity='.45'/><path d='M296 106L302 126L322 132L302 138L296 158L290 138L270 132L290 126Z' fill='#F2F0EC'/>";

    // ------------------------------------------------------------ A3 badges
    string internal constant B_BRONZE = "<path d='M352 34L364 48L352 62L340 48Z' fill='#8A5A2B'/>";
    string internal constant B_SILVER = "<path d='M352 34L364 48L352 62L340 48ZM322 34L334 48L322 62L310 48Z' fill='#C8CDD4'/>";
    string internal constant B_GOLD   = "<path d='M352 34L364 48L352 62L340 48ZM322 34L334 48L322 62L310 48ZM292 34L304 48L292 62L280 48Z' fill='#E8B23A'/>";

    /// @notice Map an ACTIVE stone's elapsed fraction (basis points, 0-10000) to a state.
    function activeState(uint256 elapsedBps) internal pure returns (uint8) {
        if (elapsedBps < 5000) return UTUH;
        if (elapsedBps < 8000) return LAPUK;
        return RETAK;
    }

    function stateLayer(uint8 s) internal pure returns (string memory) {
        if (s == UTUH) return L_UTUH;
        if (s == LAPUK) return L_LAPUK;
        if (s == RETAK) return L_RETAK;
        if (s == HANCUR) return L_HANCUR;
        return L_KRISTAL;
    }

    /// @notice Tier thresholds: 0 none, 1-2 bronze, 3-5 silver, 6+ gold.
    function badge(uint256 completed) internal pure returns (string memory) {
        if (completed == 0) return "";
        if (completed < 3) return B_BRONZE;
        if (completed < 6) return B_SILVER;
        return B_GOLD;
    }

    /// @notice Full standalone SVG. Safe to base64-encode or inline into a data URI.
    function render(uint8 s, uint256 completed) internal pure returns (string memory) {
        return string.concat(HEAD, BASE, stateLayer(s), badge(completed), TAIL);
    }
}