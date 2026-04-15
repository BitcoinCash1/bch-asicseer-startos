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
    info "Forwarding rules active"
else
    warn "VM is not running. Rules will activate automatically when you start it."
fi

# ── Print summary ────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Setup Complete"
echo "========================================"
echo ""
echo "  VM:     $VM_NAME"
echo "  VM IP:  $GUEST_IP"
echo ""
echo "  Forwarding active on:"
for IFACE in $LAN_IFACES; do
    LAN_IP=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{gsub(/\/.*/, "", $2); print $2}' | head -1)
    echo "    $IFACE ($LAN_IP)"
done
echo ""
echo "  Miner configuration — use ANY of these addresses:"
for IFACE in $LAN_IFACES; do
    LAN_IP=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{gsub(/\/.*/, "", $2); print $2}' | head -1)
    echo ""
    echo "    via $IFACE ($LAN_IP):"
    echo "      EloPool:        stratum+tcp://$LAN_IP:3333"
    echo "      ASICSeer:       stratum+tcp://$LAN_IP:3334"
    echo "      EloPool Solo:   stratum+tcp://$LAN_IP:4567"
    echo "      ASICSeer Solo:  stratum+tcp://$LAN_IP:4568"
    echo "      EloPool Web:    http://$LAN_IP:80"
    echo "      ASICSeer Web:   http://$LAN_IP:81"
done
echo ""
echo "  Username:  <your BCH address>"
echo "             or <your BCH address>.workername"
echo "  Password:  anything (e.g. 'x')"
echo ""
echo "  To check status:  sudo $0 --status"
echo "  To uninstall:     sudo $0 --remove"
echo ""
