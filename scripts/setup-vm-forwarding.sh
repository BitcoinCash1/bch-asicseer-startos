#!/usr/bin/env bash
# ============================================================================
# StartOS VM — LAN Port Forwarding Setup
# ============================================================================
#
# For users running StartOS in a libvirt/KVM virtual machine.
#
# This script installs an official libvirt "qemu hook" that automatically
# forwards mining/web ports from EVERY physical network interface (wired
# and wireless) to the StartOS VM.  Rules are applied when the VM starts
# and cleaned up when it stops.
#
# Reference: https://wiki.libvirt.org/Networking.html#forwarding-incoming-connections
#
# Usage:
#   sudo ./setup-vm-forwarding.sh              # auto-detect VM name
#   sudo ./setup-vm-forwarding.sh "My VM"      # specify VM name
#   sudo ./setup-vm-forwarding.sh --remove     # uninstall hook + rules
#   sudo ./setup-vm-forwarding.sh --status     # show current state
#
# What it does:
#   1. Detects your StartOS VM and its IP
#   2. Pins the VM IP with a static DHCP lease (survives reboots)
#   3. Installs /etc/libvirt/hooks/qemu  (official libvirt hook)
#   4. The hook forwards ports on ALL physical interfaces (wired + wifi)
#
# What it does NOT do:
#   - No bridge interfaces created
#   - No NetworkManager changes
#   - No DNS changes
#   - No firewall policy changes
#
# Ports forwarded:
#   3333  EloPool stratum       4567  EloPool solo
#   3334  ASICSeer stratum      4568  ASICSeer solo
#   80    EloPool web UI        81    ASICSeer web UI
#
# ============================================================================
set -euo pipefail

HOOK_PATH="/etc/libvirt/hooks/qemu"
PORTS="3333 3334 4567 4568 80 81"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!!]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "${CYAN}[>>]${NC} $*"; }

# ── Helper: list physical LAN interfaces ─────────────────────────────────────
get_lan_ifaces() {
    # Returns all physical (non-virtual) interfaces that are UP and have IPv4
    # This covers ethernet (eno*, enp*, eth*) and wifi (wlp*, wlan*)
    ip -4 -o addr show scope global 2>/dev/null \
        | awk '{print $2}' \
        | grep -vE '^(virbr|veth|docker|br-|lo|vnet|wg|tun|tap)' \
        | sort -u
}

# ── Status mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--status" ]]; then
    echo ""
    echo "=== Qemu Hook ==="
    if [[ -f "$HOOK_PATH" ]]; then
        info "Hook installed at $HOOK_PATH"
        grep -E '^(VM_NAME|GUEST_IP|PORTS)=' "$HOOK_PATH" 2>/dev/null | sed 's/^/     /'
    else
        warn "No hook installed"
    fi
    echo ""
    echo "=== Active Forwarding Rules ==="
    rules=$(iptables -t nat -S 2>/dev/null | grep -cE "DNAT --to-destination 192\.168\.122\." || true)
    echo "  NAT DNAT rules: ${rules:-0}"
    rules=$(iptables -S FORWARD 2>/dev/null | grep -cE "192\.168\.122\." || true)
    echo "  FORWARD rules:  ${rules:-0}"
    echo ""
    echo "=== Network Interfaces ==="
    for iface in $(get_lan_ifaces); do
        ip=$(ip -4 addr show "$iface" | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
        echo "  $iface: $ip"
    done
    echo ""
    exit 0
fi

# ── Remove mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--remove" ]]; then
    [[ $EUID -eq 0 ]] || error "Run with sudo: sudo $0 --remove"
    step "Removing qemu hook..."
    rm -f "$HOOK_PATH"
    step "Flushing forwarding iptables rules..."
    # Remove all our DNAT rules
    iptables -t nat -S 2>/dev/null | grep -E "DNAT --to-destination 192\.168\.122\." | while IFS= read -r rule; do
        iptables -t nat $(echo "$rule" | sed 's/^-A /-D /') 2>/dev/null || true
    done
    # Remove MASQUERADE rules for VM subnet
    iptables -t nat -S 2>/dev/null | grep -E "MASQUERADE" | grep -E "192\.168\.122\." | while IFS= read -r rule; do
        iptables -t nat $(echo "$rule" | sed 's/^-A /-D /') 2>/dev/null || true
    done
    # Remove FORWARD rules for VM
    iptables -S FORWARD 2>/dev/null | grep -E "192\.168\.122\." | while IFS= read -r rule; do
        iptables $(echo "$rule" | sed 's/^-A /-D /') 2>/dev/null || true
    done
    # Remove static DHCP lease if present
    step "Removing static DHCP lease (if any)..."
    for mac_ip in $(virsh net-dumpxml default 2>/dev/null | grep -oP "mac='\K[^']+(?='[^>]*ip='[^']+)" || true); do
        mac="$mac_ip"
        lease_ip=$(virsh net-dumpxml default 2>/dev/null | grep "$mac" | grep -oP "ip='\K[^']+" || true)
        if [[ -n "$lease_ip" ]]; then
            virsh net-update default delete ip-dhcp-host \
                "<host mac='$mac' ip='$lease_ip'/>" --live --config 2>/dev/null || true
        fi
    done
    step "Restarting libvirtd..."
    systemctl restart libvirtd 2>/dev/null || true
    info "All forwarding removed. System is clean."
    exit 0
fi

# ── Must be root ─────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Run with sudo:  sudo $0"

# ── Preflight checks ────────────────────────────────────────────────────────
command -v virsh   &>/dev/null || error "virsh not found. Install libvirt: sudo apt install libvirt-daemon-system"
command -v iptables &>/dev/null || error "iptables not found. Install: sudo apt install iptables"
systemctl is-active libvirtd &>/dev/null || error "libvirtd is not running"

# ── Find the VM ──────────────────────────────────────────────────────────────
if [[ -n "${1:-}" ]]; then
    VM_NAME="$1"
    virsh dominfo "$VM_NAME" &>/dev/null || error "VM '$VM_NAME' not found. List VMs: virsh list --all"
else
    step "Auto-detecting StartOS VM..."
    VM_NAME=$(virsh list --all --name 2>/dev/null | grep -iE "start|s9|startos" | head -1)
    if [[ -z "$VM_NAME" ]]; then
        echo ""
        warn "Could not auto-detect. Available VMs:"
        virsh list --all --name 2>/dev/null | grep -v '^$' | sed 's/^/    /'
        echo ""
        error "Specify VM name:  sudo $0 \"<vm-name>\""
    fi
    info "Found VM: $VM_NAME"
fi

# ── Get VM IP ────────────────────────────────────────────────────────────────
step "Getting VM IP address..."
GUEST_IP=$(virsh domifaddr "$VM_NAME" 2>/dev/null | awk '/ipv4/{gsub(/\/.*/, "", $4); print $4}' | head -1)
if [[ -z "$GUEST_IP" ]]; then
    GUEST_IP=$(virsh net-dhcp-leases default 2>/dev/null | awk '/192\.168\.122/{gsub(/\/.*/, "", $5); print $5}' | head -1)
fi
[[ -n "$GUEST_IP" ]] || error "Cannot determine VM IP. Make sure the VM is running."
info "VM IP: $GUEST_IP"

# ── Pin VM IP with static DHCP lease ─────────────────────────────────────────
VM_MAC=$(virsh domiflist "$VM_NAME" 2>/dev/null | awk '/virtio|rtl|e1000/{print $5}' | head -1)
[[ -n "$VM_MAC" ]] || error "Cannot find VM MAC address"

if virsh net-dumpxml default 2>/dev/null | grep -q "$VM_MAC"; then
    info "Static DHCP lease already exists for $VM_MAC"
else
    step "Pinning VM IP: $VM_MAC → $GUEST_IP (static DHCP lease)..."
    virsh net-update default add ip-dhcp-host \
        "<host mac='$VM_MAC' ip='$GUEST_IP'/>" --live --config 2>/dev/null \
        || warn "Could not add static lease — continuing anyway"
    info "VM IP pinned (will survive reboots)"
fi

# ── Detect all LAN interfaces ───────────────────────────────────────────────
step "Detecting network interfaces..."
LAN_IFACES=$(get_lan_ifaces)
if [[ -z "$LAN_IFACES" ]]; then
    error "No physical network interfaces with IPv4 found"
fi
for iface in $LAN_IFACES; do
    ip=$(ip -4 addr show "$iface" | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
    info "  $iface ($ip)"
done

# ── Install the qemu hook ───────────────────────────────────────────────────
step "Installing libvirt qemu hook..."
mkdir -p "$(dirname "$HOOK_PATH")"

cat > "$HOOK_PATH" << 'HOOKEOF'
#!/bin/bash
# ================================================================
# Libvirt QEMU Hook — StartOS VM Port Forwarding
# ================================================================
# Auto-generated by setup-vm-forwarding.sh
# Forwards mining ports on ALL physical LAN interfaces to the VM.
# Applied on VM start, removed on VM stop.
#
# Reference: https://wiki.libvirt.org/Networking.html
# ================================================================

VM_NAME="PLACEHOLDER_VM"
GUEST_IP="PLACEHOLDER_IP"
LIBVIRT_BRIDGE="virbr0"
PORTS="PLACEHOLDER_PORTS"

# Get all physical LAN interfaces (wired + wireless), excluding virtual ones
get_lan_ifaces() {
    ip -4 -o addr show scope global 2>/dev/null \
        | awk '{print $2}' \
        | grep -vE '^(virbr|veth|docker|br-|lo|vnet|wg|tun|tap)' \
        | sort -u
}

if [ "${1}" = "${VM_NAME}" ]; then

    # ── VM stopped: clean up rules ───────────────────────────────────────
    if [ "${2}" = "stopped" ] || [ "${2}" = "reconnect" ]; then
        for IFACE in $(get_lan_ifaces); do
            for PORT in $PORTS; do
                /sbin/iptables -D FORWARD -i "${IFACE}" -o "${LIBVIRT_BRIDGE}" \
                    -p tcp -d "${GUEST_IP}" --dport "${PORT}" -j ACCEPT 2>/dev/null || true
                /sbin/iptables -t nat -D PREROUTING -i "${IFACE}" -p tcp \
                    --dport "${PORT}" -j DNAT --to "${GUEST_IP}:${PORT}" 2>/dev/null || true
            done
            /sbin/iptables -t nat -D POSTROUTING -s "${GUEST_IP}" \
                -o "${IFACE}" -j MASQUERADE 2>/dev/null || true
        done
        # Remove MASQUERADE for forwarded traffic to VM
        /sbin/iptables -t nat -D POSTROUTING -o "${LIBVIRT_BRIDGE}" \
            -d "${GUEST_IP}" -j MASQUERADE 2>/dev/null || true
    fi

    # ── VM started: install forwarding rules ─────────────────────────────
    if [ "${2}" = "start" ] || [ "${2}" = "reconnect" ]; then
        for IFACE in $(get_lan_ifaces); do
            for PORT in $PORTS; do
                /sbin/iptables -I FORWARD 1 -i "${IFACE}" -o "${LIBVIRT_BRIDGE}" \
                    -p tcp -d "${GUEST_IP}" --dport "${PORT}" -j ACCEPT
                /sbin/iptables -t nat -I PREROUTING 1 -i "${IFACE}" -p tcp \
                    --dport "${PORT}" -j DNAT --to "${GUEST_IP}:${PORT}"
            done
            /sbin/iptables -t nat -I POSTROUTING 1 -s "${GUEST_IP}" \
                -o "${IFACE}" -j MASQUERADE
        done
        # MASQUERADE forwarded traffic so VM sees it from its local gateway
        /sbin/iptables -t nat -I POSTROUTING 1 -o "${LIBVIRT_BRIDGE}" \
            -d "${GUEST_IP}" -j MASQUERADE
    fi
fi
HOOKEOF

# Fill in values
sed -i "s/PLACEHOLDER_VM/$VM_NAME/g" "$HOOK_PATH"
sed -i "s/PLACEHOLDER_IP/$GUEST_IP/g" "$HOOK_PATH"
sed -i "s/PLACEHOLDER_PORTS/$PORTS/g" "$HOOK_PATH"
chmod +x "$HOOK_PATH"
info "Hook installed at $HOOK_PATH"

# ── Restart libvirtd ─────────────────────────────────────────────────────────
step "Restarting libvirtd to load hook..."
systemctl restart libvirtd
info "libvirtd restarted"

# ── Apply rules now if VM is running ─────────────────────────────────────────
VM_STATE=$(virsh domstate "$VM_NAME" 2>/dev/null | tr -d '[:space:]')
if [[ "$VM_STATE" == "running" ]]; then
    step "VM is running — applying rules now..."
    for IFACE in $LAN_IFACES; do
        for PORT in $PORTS; do
            iptables -I FORWARD 1 -i "$IFACE" -o virbr0 \
                -p tcp -d "$GUEST_IP" --dport "$PORT" -j ACCEPT 2>/dev/null || true
            iptables -t nat -I PREROUTING 1 -i "$IFACE" -p tcp \
                --dport "$PORT" -j DNAT --to "$GUEST_IP:$PORT" 2>/dev/null || true
        done
        iptables -t nat -I POSTROUTING 1 -s "$GUEST_IP" -o "$IFACE" -j MASQUERADE 2>/dev/null || true
    done
    # MASQUERADE forwarded traffic so VM sees it from its local gateway
    iptables -t nat -I POSTROUTING 1 -o virbr0 -d "$GUEST_IP" -j MASQUERADE 2>/dev/null || true
    info "Forwarding rules active"
else
    warn "VM is not running. Rules will activate automatically when you start it."
fi

# ── Print summary ────────────────────────────────────────────────────────────
# ── Build miner connection info ──────────────────────────────────────────────
# Pick the first LAN IP for the main recommendation
PRIMARY_IP=""
for IFACE in $LAN_IFACES; do
    PRIMARY_IP=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{gsub(/\/.*/, "", $2); print $2}' | head -1)
    break
done

MINER_INFO="═══════════════════════════════════════════════════
   MINER CONNECTION INFO — Copy into your miner!
═══════════════════════════════════════════════════

  ┌─ Pool Mining (rewards shared among miners) ──┐
  │                                               │
  │  EloPool:   stratum+tcp://${PRIMARY_IP}:3333  │
  │  ASICSeer:  stratum+tcp://${PRIMARY_IP}:3334  │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌─ Solo Mining (winner takes all) ─────────────┐
  │                                               │
  │  EloPool:   stratum+tcp://${PRIMARY_IP}:4567  │
  │  ASICSeer:  stratum+tcp://${PRIMARY_IP}:4568  │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌─ Web Dashboards ─────────────────────────────┐
  │                                               │
  │  EloPool:   http://${PRIMARY_IP}:80           │
  │  ASICSeer:  http://${PRIMARY_IP}:81           │
  │                                               │
  └───────────────────────────────────────────────┘

  Username:  <your BCH address>
             or <your BCH address>.workername
  Password:  anything (e.g. x)"

MINER_INFO_EXTRA=""
IFACE_COUNT=0
for IFACE in $LAN_IFACES; do
    IFACE_COUNT=$((IFACE_COUNT + 1))
done
if [[ $IFACE_COUNT -gt 1 ]]; then
    MINER_INFO_EXTRA="

  ── Additional interfaces ──"
    SKIP_FIRST=true
    for IFACE in $LAN_IFACES; do
        if $SKIP_FIRST; then SKIP_FIRST=false; continue; fi
        LAN_IP=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{gsub(/\/.*/, "", $2); print $2}' | head -1)
        MINER_INFO_EXTRA="${MINER_INFO_EXTRA}
  You can also use ${LAN_IP} (${IFACE}) instead."
    done
fi

# ── Best-effort: fetch StartOS Tor (.onion) addresses for the pool services ─
# If the user has `start-cli` installed AND an active auth cookie, we can pull
# the currently enabled .onion addresses for bch-elopool / bch-asicseer and
# print them so Tor-using miners can connect privately.
#
# Users must first enable a Tor address for each binding inside the StartOS UI
# (Service → Interfaces → add .onion). If none are enabled, we print a hint
# explaining where to enable them.

# Resolve real (non-root) user early so start-cli can read their cookie file
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER" 2>/dev/null || echo "$HOME")

TOR_INFO=""
fetch_tor_addrs() {
    local cookie="${REAL_HOME}/.startos/.cookies.json"
    command -v start-cli &>/dev/null || return 0
    [[ -f "$cookie" ]] || return 0

    local db_json
    db_json=$(sudo -u "$REAL_USER" start-cli -H "http://${GUEST_IP}" \
        --cookie-path "$cookie" db dump --format json 2>/dev/null) || return 0
    [[ -n "$db_json" ]] || return 0

    command -v jq &>/dev/null || return 0

    local onion_lines
    onion_lines=$(printf '%s' "$db_json" | jq -r '
        .value.packageData
        | to_entries[]
        | select(.key == "bch-elopool" or .key == "bch-asicseer")
        | .key as $pkg
        | (.value.hosts // {})
        | to_entries[]
        | .key as $svc
        | (.value.bindings // {})
        | to_entries[]
        | .key as $port
        | ( ((.value.addresses.enabled // [])[])
            | if type == "string" then .
              elif type == "object" then "\(.hostname):\(.port)"
              else empty end )
        | select(test("\\.onion:"))
        | "\($pkg)\t\($svc)\t\($port)\tstratum+tcp://\(.)"
    ' 2>/dev/null)

    if [[ -n "$onion_lines" ]]; then
        TOR_INFO=$'\n\n  ┌─ Tor (.onion) Stratum URLs ──────────────────┐\n'
        while IFS=$'\t' read -r pkg svc port url; do
            [[ -z "$pkg" ]] && continue
            TOR_INFO="${TOR_INFO}  │  ${pkg} ${svc} :${port}\n  │    ${url}\n"
        done <<< "$onion_lines"
        TOR_INFO="${TOR_INFO}  └──────────────────────────────────────────────┘"
    else
        TOR_INFO=$'\n\n  ┌─ Tor (.onion) Not Configured ─────────────────┐\n  │                                               │\n  │  To enable Tor-private mining, in StartOS UI: │\n  │    Service → Interfaces → Pool/Solo Mining  │\n  │    Tap \"Add\" → select \"Tor\"                 │\n  │  Re-run this script to print the .onion URL. │\n  │                                               │\n  └───────────────────────────────────────────────┘'
    fi
}
fetch_tor_addrs || true

FULL_INFO="${MINER_INFO}${MINER_INFO_EXTRA}${TOR_INFO}"

# ── Print to terminal ────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "  VM:     $VM_NAME"
echo "  VM IP:  $GUEST_IP (internal, don't use this in miners)"
echo ""
echo "$FULL_INFO"
echo ""
echo "  Persistence: rules live in the libvirt qemu hook at:"
echo "    $HOOK_PATH"
echo "  They are re-applied automatically every time the VM starts,"
echo "  including after host reboots. No cron job or systemd unit needed."
echo ""
echo "  To check status:  sudo $0 --status"
echo "  To uninstall:     sudo $0 --remove"
echo ""

# ── Save to Desktop ──────────────────────────────────────────────────────────
# REAL_USER / REAL_HOME were resolved earlier (before the Tor lookup).

# Try XDG desktop, then ~/Desktop, then home
DESKTOP_DIR=$(sudo -u "$REAL_USER" xdg-user-dir DESKTOP 2>/dev/null || true)
if [[ -z "$DESKTOP_DIR" || ! -d "$DESKTOP_DIR" ]]; then
    DESKTOP_DIR="$REAL_HOME/Desktop"
fi
if [[ ! -d "$DESKTOP_DIR" ]]; then
    DESKTOP_DIR="$REAL_HOME"
fi

TXT_FILE="$DESKTOP_DIR/Miner-Connection-Info.txt"
cat > "$TXT_FILE" << TXTEOF
MINER CONNECTION INFO
Generated by setup-vm-forwarding.sh on $(date '+%Y-%m-%d %H:%M')
VM: $VM_NAME | VM IP: $GUEST_IP

$FULL_INFO

══════════════════════════════════════
  Management Commands
══════════════════════════════════════

  Check status:    sudo $0 --status
  Uninstall:       sudo $0 --remove
TXTEOF
chown "$REAL_USER:$REAL_USER" "$TXT_FILE" 2>/dev/null || true
chmod 644 "$TXT_FILE"
info "Saved to: $TXT_FILE"

# ── Show popup window (if display available) ─────────────────────────────────
# Try zenity (GNOME), then kdialog (KDE), then xmessage (X11 fallback)
show_popup() {
    # Need a display for GUI popups
    local DISPLAY_VAR="${DISPLAY:-}"
    if [[ -z "$DISPLAY_VAR" ]]; then
        # Try to grab the real user's display
        DISPLAY_VAR=$(who 2>/dev/null | awk '/\(:[0-9]/{gsub(/[()]/, "", $NF); print $NF; exit}')
    fi
    if [[ -z "$DISPLAY_VAR" ]]; then
        DISPLAY_VAR=":0"
    fi
    local XAUTH="${XAUTHORITY:-$REAL_HOME/.Xauthority}"

    if command -v zenity &>/dev/null; then
        sudo -u "$REAL_USER" \
            DISPLAY="$DISPLAY_VAR" XAUTHORITY="$XAUTH" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" \
            zenity --text-info \
            --title="Miner Connection Info — Copy for your ASIC!" \
            --width=580 --height=520 \
            --filename="$TXT_FILE" \
            --font="monospace" 2>/dev/null &
        info "Popup window opened (zenity)"
    elif command -v kdialog &>/dev/null; then
        sudo -u "$REAL_USER" \
            DISPLAY="$DISPLAY_VAR" XAUTHORITY="$XAUTH" \
            kdialog --textbox "$TXT_FILE" 580 520 \
            --title "Miner Connection Info" 2>/dev/null &
        info "Popup window opened (kdialog)"
    elif command -v xdg-open &>/dev/null; then
        sudo -u "$REAL_USER" \
            DISPLAY="$DISPLAY_VAR" XAUTHORITY="$XAUTH" \
            xdg-open "$TXT_FILE" 2>/dev/null &
        info "Opened in text editor (xdg-open)"
    else
        warn "No GUI dialog found (zenity/kdialog). Info saved to: $TXT_FILE"
    fi
}

show_popup
