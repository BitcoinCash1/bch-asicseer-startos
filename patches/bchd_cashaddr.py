#!/usr/bin/env python3
"""
Patch asicseer-pool's bitcoin.c to handle BCHD's wallet-less validateaddress response.

BCHD has no built-in wallet, so validateaddress omits scriptPubKey. Instead of
quitting, derive the scriptPubKey from the CashAddr address directly.
"""

import sys

HELPER = r"""
/* CashAddr alphabet (BIP-0173 variant for BCH) */
static const char cashaddr_charset_[] = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/* Derive scriptPubKey from a BCH CashAddr address without needing wallet RPC.
 * Handles P2PKH (version 0x00 -> 25-byte script) and P2SH (version 0x08 -> 23-byte script).
 * Returns script byte length on success, 0 on failure. */
static int cashaddr_to_scriptpubkey_(const char *address, unsigned char *script, int maxlen)
{
    if (!address || !script || maxlen < 23) return 0;
    /* Skip "bitcoincash:" or any prefix before ':' */
    const char *p = strrchr(address, ':');
    const char *payload = p ? p + 1 : address;
    int paylen = (int)strlen(payload);
    /* CashAddr for a 20-byte hash: 34 data chars + 8 checksum chars = 42 */
    if (paylen < 42) return 0;
    int datalen = paylen - 8;
    if (datalen != 34) return 0;
    /* Decode base32 characters to 5-bit values */
    unsigned char b5[34];
    for (int i = 0; i < 34; i++) {
        const char *q = strchr(cashaddr_charset_, (unsigned char)payload[i]);
        if (!q) return 0;
        b5[i] = (unsigned char)(q - cashaddr_charset_);
    }
    /* Unpack 34 groups of 5 bits -> 21 bytes (168 bits) + 2 padding bits */
    unsigned int acc = 0; int bits = 0;
    unsigned char decoded[21]; int dlen = 0;
    for (int i = 0; i < 34; i++) {
        acc = (acc << 5) | b5[i];
        bits += 5;
        if (bits >= 8) { bits -= 8; decoded[dlen++] = (unsigned char)((acc >> bits) & 0xFF); }
    }
    if (dlen != 21) return 0;
    unsigned char version = decoded[0];
    const unsigned char *hash = decoded + 1;
    if (version == 0x00) { /* P2PKH: OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG */
        if (maxlen < 25) return 0;
        script[0]=0x76; script[1]=0xa9; script[2]=0x14;
        memcpy(script + 3, hash, 20);
        script[23]=0x88; script[24]=0xac;
        return 25;
    }
    if (version == 0x08) { /* P2SH: OP_HASH160 <20> OP_EQUAL */
        if (maxlen < 23) return 0;
        script[0]=0xa9; script[1]=0x14;
        memcpy(script + 2, hash, 20);
        script[22]=0x87;
        return 23;
    }
    return 0;
}

/* Base58 alphabet (Bitcoin/BCH legacy addresses) */
static const char base58_alphabet_[] = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/* Derive scriptPubKey from a legacy Base58Check address (no wallet RPC needed).
 * Handles P2PKH (version 0x00, starts with '1' -> 25-byte script)
 * and P2SH  (version 0x05, starts with '3' -> 23-byte script).
 * Skips checksum verification — the address was already validated by the node.
 * Returns script byte length on success, 0 on failure. */
static int base58check_to_scriptpubkey_(const char *address, unsigned char *script, int maxlen)
{
    if (!address || !script || maxlen < 23) return 0;
    int alen = (int)strlen(address);
    if (alen < 25 || alen > 35) return 0;
    /* Map each character to 0-57 */
    unsigned char digits[35];
    for (int i = 0; i < alen; i++) {
        const char *q = strchr(base58_alphabet_, (unsigned char)address[i]);
        if (!q) return 0;
        digits[i] = (unsigned char)(q - base58_alphabet_);
    }
    /* Decode base58 big-integer into 25 bytes */
    unsigned char decoded[25]; memset(decoded, 0, 25);
    for (int i = 0; i < alen; i++) {
        unsigned int carry = digits[i];
        for (int j = 24; j >= 0; j--) {
            carry += 58u * decoded[j];
            decoded[j] = (unsigned char)(carry & 0xFF);
            carry >>= 8;
        }
    }
    unsigned char ver = decoded[0];
    const unsigned char *hash = decoded + 1; /* bytes 1-20 are the hash160 */
    if (ver == 0x00) { /* P2PKH: OP_DUP OP_HASH160 <20> hash OP_EQUALVERIFY OP_CHECKSIG */
        if (maxlen < 25) return 0;
        script[0]=0x76; script[1]=0xa9; script[2]=0x14;
        memcpy(script + 3, hash, 20);
        script[23]=0x88; script[24]=0xac;
        return 25;
    }
    if (ver == 0x05) { /* P2SH: OP_HASH160 <20> hash OP_EQUAL */
        if (maxlen < 23) return 0;
        script[0]=0xa9; script[1]=0x14;
        memcpy(script + 2, hash, 20);
        script[22]=0x87;
        return 23;
    }
    return 0;
}

"""

OLD_QUIT = ('        if (unlikely(!tmp_val || !(spk = json_string_value(tmp_val)))) {\n'
            '            /* All recent bitcoinds with wallet support built in should\n'
            '             * support this, if not, quit here to keep things simple. */\n'
            '            quit(1, "No scriptPubkey returned for address %s -- please use a bitcoind with wallet support.", address);\n'
            '        }')

NEW_BLOCK = ('        if (!tmp_val || !(spk = json_string_value(tmp_val))) {\n'
             '            /* BCHD has no wallet; derive scriptPubKey from address format directly.\n'
             '             * Try CashAddr (bitcoincash:q.../p...) then legacy Base58Check (1.../3...) */\n'
             '            int calen_ = cashaddr_to_scriptpubkey_(address, (unsigned char *)cscript_out, *cscript_len);\n'
             '            if (!calen_)\n'
             '                calen_ = base58check_to_scriptpubkey_(address, (unsigned char *)cscript_out, *cscript_len);\n'
             '            if (!calen_)\n'
             '                quit(1, "No scriptPubkey for %s: not a recognised address format", address);\n'
             '            *cscript_len = calen_;\n'
             '            ret = true;\n'
             '            goto out;\n'
             '        }')

OLD_ISVALID = ('    if (!json_is_true(valid_val)) {\n'
               '        LOGDEBUG("Bitcoin address %s is NOT valid", address);\n'
               '        goto out;\n'
               '    }')

NEW_ISVALID = ('    if (!json_is_true(valid_val)) {\n'
               '        /* The node validateaddress is legacy-base58-only (e.g. Flowee the\n'
               '         * Hub) and rejects cashaddr. Accept the address if we can derive a\n'
               '         * scriptPubKey from it ourselves; otherwise it really is invalid. */\n'
               '        unsigned char dscript_[40]; int dlen_ = (int)sizeof(dscript_);\n'
               '        int dn_ = cashaddr_to_scriptpubkey_(address, dscript_, dlen_);\n'
               '        if (!dn_) dn_ = base58check_to_scriptpubkey_(address, dscript_, dlen_);\n'
               '        if (!dn_) {\n'
               '            LOGDEBUG("Bitcoin address %s is NOT valid", address);\n'
               '            goto out;\n'
               '        }\n'
               '        if (cscript_out && cscript_len) {\n'
               '            if (dn_ > *cscript_len) {\n'
               '                LOGERR("Not enough space for derived scriptPubkey");\n'
               '                goto out;\n'
               '            }\n'
               '            memcpy(cscript_out, dscript_, dn_);\n'
               '            *cscript_len = dn_;\n'
               '        }\n'
               '        if (is_p2sh)\n'
               '            *is_p2sh = (dscript_[0] == 0xa9);\n'
               '        ret = true;\n'
               '        goto out;\n'
               '    }')

ANCHOR = 'bool validate_address('

with open('src/bitcoin.c', 'r') as f:
    src = f.read()

if ANCHOR not in src:
    print('ERROR: anchor not found in bitcoin.c', file=sys.stderr)
    sys.exit(1)

if OLD_QUIT not in src:
    print('ERROR: scriptPubKey quit block not found in bitcoin.c', file=sys.stderr)
    sys.exit(1)

if OLD_ISVALID not in src:
    print('ERROR: isvalid block not found in bitcoin.c', file=sys.stderr)
    sys.exit(1)

# Insert helper before validate_address
src = src.replace(ANCHOR, HELPER + ANCHOR)
# Replace quit block with CashAddr fallback
src = src.replace(OLD_QUIT, NEW_BLOCK)
# Accept a derivable cashaddr/legacy address even when the node's (legacy-only)
# validateaddress reports isvalid=false (e.g. Flowee the Hub rejects cashaddr).
src = src.replace(OLD_ISVALID, NEW_ISVALID)

with open('src/bitcoin.c', 'w') as f:
    f.write(src)

print('bitcoin.c patched: cashaddr_to_scriptpubkey_ added, scriptPubKey fallback applied')
