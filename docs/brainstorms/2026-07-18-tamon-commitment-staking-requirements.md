---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
date: 2026-07-18
status: active
---

# Tamon — Plan

## Goal Capsule

**Objective.** Membangun aplikasi commitment staking on-chain di Monad testnet untuk hackathon Spark: developer mempertaruhkan MON pada target ngoding yang diverifikasi objektif lewat GitHub, dengan stake diparkir di protokol liquid staking sehingga menghasilkan yield, dan tiap komitmen berwujud NFT dinamis yang lapuk seiring mendekati deadline.

**Product authority.** Pemilik repo (user). Tidak ada stakeholder lain; keputusan produk diambil langsung dalam sesi ini.

**Open blockers.** Tidak ada yang memblokir mulai membangun. Satu gerbang teknis: round-trip deposit→redeem shMON harus terbukti jalan dalam 2 jam pertama (lihat Dependencies).

---

## Product Contract

### Masalah

Developer punya banyak proyek yang tidak pernah selesai. Niat tidak kekurangan; yang kurang adalah konsekuensi. Aplikasi to-do tidak mengubah perilaku karena mencentang kotak tidak menimbulkan biaya apa pun saat gagal.

Solusi konvensional (commitment contract seperti Beeminder/StickK) sudah membuktikan bahwa taruhan uang mengubah perilaku, tetapi semuanya punya dua kelemahan yang bisa diperbaiki on-chain:

1. **Uang yang dipertaruhkan menganggur.** Selama periode komitmen, dana hanya diam di rekening penyedia.
2. **Verifikasi bertumpu pada kejujuran diri.** Sebagian besar bertumpu pada laporan mandiri, yang justru paling rapuh saat paling dibutuhkan.

### Pengguna

Developer yang menulis kode di GitHub dan mengenali pola "repo setengah jadi" pada dirinya sendiri. Sempit dan disengaja: target ngoding bisa diverifikasi objektif lewat commit, sementara "olahraga tiga kali seminggu" tidak bisa. Batasan ini yang membuat produknya jujur.

Untuk hackathon, pengguna sekunder yang nyata adalah **juri**: mereka harus bisa menjalankan siklus penuh dalam hitungan menit memakai MON faucet gratis, tanpa mengeluarkan uang sungguhan.

### Hasil yang diinginkan

Developer membuat komitmen yang terikat uang, melihat konsekuensinya memburuk secara visual dan real-time saat menunda, dan keluar dengan modal + yield + bagian dari stake orang yang gagal jika berhasil.

### Requirements

**R1 — Buat komitmen.** User menyebut repo GitHub, target (N commit), dan durasi, lalu stake MON. Durasi harus menerima rentang **menit sampai minggu** — bukan hanya minggu. Ini bukan kelonggaran, ini requirement: demo 3 menit tidak bisa menunggu seminggu, dan juri harus melihat siklus hidup penuh.

**R2 — Stake menghasilkan yield.** MON yang dipertaruhkan langsung masuk ke liquid staking, bukan diam di escrow. User yang berhasil menerima lebih banyak MON daripada yang disetor, dan selisihnya harus terlihat sebagai angka di UI.

**R3 — Verifikasi objektif.** Penyelesaian ditentukan oleh data GitHub yang nyata (commit di repo yang disebut, sejak waktu komitmen dibuat), bukan klaim mandiri. Tingkat kepercayaan sistem harus dinyatakan jujur ke user dan juri — ini *trust-minimized*, bukan *trustless*.

**R4 — Kegagalan membiayai keberhasilan.** Stake yang hangus mengalir ke pengguna yang berhasil, bukan hangus ke ketiadaan. Pernyataan ekonominya: *"Anda mendapat bagian dari stake yang hangus selama stake Anda sendiri sedang berisiko."* Distribusi harus adil terlepas dari urutan klaim, dan tidak boleh ada dana yang nyangkut permanen.

**R5 — NFT sebagai representasi komitmen.** Tiap komitmen adalah satu NFT "batu" yang penampilannya turunan dari waktu dan status: utuh → lapuk → retak → hancur (gagal) / kristal (berhasil). Batu harus berubah **tanpa transaksi apa pun** — murni fungsi dari waktu. Refresh halaman, retakannya bertambah.

**R6 — Badge akumulatif.** Setelah beberapa task berhasil, user mendapat penanda tingkat yang terlihat. Bagian dari NFT yang sama, bukan koleksi terpisah.

**R7 — Dana tidak boleh terkunci.** Tidak ada kondisi di mana user yang berhak tidak bisa mengeluarkan dananya. Ini mengalahkan semua requirement lain jika bertabrakan.

### Batas Lingkup

**Ditunda ke nanti**
- Verifikasi selain GitHub (Strava, Duolingo, screenshot). Menarik, tapi tiap sumber butuh integrasi terpisah dan melemahkan klaim "objektif".
- Task sosial/tim, leaderboard, sistem teman.
- Mainnet. Testnet dipilih sadar demi kemudahan juri mencoba.
- Menghilangkan kepercayaan pada verifier (TEE/zkTLS oracle). Diakui sebagai arah, bukan lingkup sekarang.

**Di luar identitas produk ini**
- To-do app umum. Kalau task-nya tidak bisa diverifikasi mesin, produk ini tidak boleh menerimanya — menerima klaim mandiri untuk task apa pun akan meruntuhkan seluruh premisnya.
- Produk finansial. Yield adalah efek samping dari menahan modal, bukan alasan orang datang. Kalau ini berubah menjadi tempat mengejar imbal hasil, targetnya salah.
- Judi. Stake hangus mengalir ke pengguna disiplin lain, bukan ke bandar. Perbedaan ini harus tetap terjaga dalam desain apa pun ke depan.

### Kriteria Keberhasilan

1. Siklus penuh berjalan on-chain di Monad testnet: commit → batu melapuk → (selesai → kristal + saldo naik) atau (gagal → hancur + dompet pemenang lain naik).
2. User yang berhasil menerima MON **lebih banyak** dari yang disetor, dan selisih yield-nya terlihat jelas.
3. NFT berubah wujud tanpa transaksi, cukup dari berjalannya waktu.
4. Contract address terverifikasi di explorer publik.
5. Seluruhnya bisa didemonstrasikan dalam ≤3 menit oleh orang yang belum pernah melihat aplikasinya.

### Dependencies / Assumptions

**Terverifikasi on-chain (bukan asumsi):**
- Monad testnet chain ID 10143 hidup; faucet memberi 50 MON/24 jam.
- shMON (FastLane) `0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9` hidup, ERC-7535 (deposit MON native via `msg.value`), redeem **sinkron** tanpa antrian.
- Nilai tukar saat ini **11.73 MON per shMON — bukan 1:1**, dan naik tiap blok (~110% APY di testnet).
- `maxRedeem` adalah **plafon global**, bukan per-user (~15.3 shMON). Melebihi → revert.
- Address shMON/aprMON/gMON/sMON dari dokumentasi lama **sudah mati** — testnet re-genesis 16 Des 2025.
- Limit bytecode Monad 128KB runtime, jadi renderer SVG on-chain muat dalam satu kontrak.

**Asumsi yang belum diuji:**
- shMON tetap likuid dan tidak dipause selama periode hackathon. Dimitigasi lewat R7 (jalur keluar in-kind).
- Rate limit GitHub API cukup untuk skala demo.
- Yield testnet ~110% APY bertahan cukup stabil sehingga selisihnya terlihat pada task berdurasi menit. **Kalau ternyata tidak terlihat pada durasi pendek, demo harus memakai task berdurasi jam, bukan menit.**

**Gerbang eksekusi:** jika round-trip deposit→redeem shMON tidak terbukti jalan dalam 2 jam pertama, integrasi staking dipotong dan MON disimpan mentah di escrow. R2 gugur; sisa produk tetap utuh dan tetap layak disubmit.

### Pertanyaan Terbuka

1. **Self-dealing tidak tertutup penuh.** User dengan modal besar bisa sengaja gagal untuk memutar stake ke komitmennya sendiri yang berhasil. Dibatasi oleh biaya slash 10% (menguntungkan hanya jika menguasai >90% bobot total), tapi tidak dihilangkan. Penutupan penuh butuh eksklusi per-pemilik — di luar anggaran waktu, dan harus dinyatakan sebagai limitasi yang diketahui.
2. **Pengikatan akun GitHub ke wallet.** OAuth mencegah user menunjuk repo orang lain, tapi belum diputuskan seberapa ketat pengikatannya harus ditegakkan pada aliran demo.
3. **Apa arti "commit" secara tepat.** Commit oleh penulis tertentu? Di branch default saja? Force-push bisa menulis ulang sejarah. Untuk hackathon aturan paling sederhana yang dapat dipertahankan sudah cukup, tapi ini akan menjadi masalah nyata pada produk sungguhan.

---

## Catatan Konteks Hackathon

Spark (Monad Foundation × BuildAnything), deadline **19 Juli 2026 23:59 UTC**. Hadiah 3× $500 "most elegant solutions" + $500 "most viral". Juri AI secara eksplisit menghukum UI "AI slop", fitur palsu, dan demo tidak berfungsi; menghargai *"real working features over multiple fake ones"*.

Dua konsekuensi desain yang mengalir langsung dari kriteria juri itu:

- **Satu kontrak, nol backend untuk NFT.** SVG dirender penuh on-chain dari `(start, deadline, state, block.timestamp)`. Tidak ada server metadata, IPFS, atau cron job. Ini cerita "elegant" yang bisa dipertahankan.
- **Jujur soal batas kepercayaan.** Kunci verifier adalah hot key; verifier yang dikompromikan bisa mencetak sukses palsu. Dinyatakan terbuka di README dan video. Klaim palsu dihukum jauh lebih keras daripada arsitektur yang jujur soal batasnya.

Rencana implementasi (state layout, matematika accumulator, permukaan serangan, urutan build 30 jam) ada terpisah di `/Users/shinrai/.claude/plans/jazzy-stargazing-crayon.md`.
