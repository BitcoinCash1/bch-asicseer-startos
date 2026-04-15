#!/usr/bin/env bash
# ============================================================================
# StartOS VM — Port Forwarding Setup for macOS
# ============================================================================
#
# One-command setup for forwarding mining ports from your Mac to a StartOS
# VM running in VirtualBox or UTM (QEMU).
#
# Usage:
#   sudo ./setup-vm-forwarding-mac.sh              # auto-detect VM
#   sudo ./setup-vm-forwarding-mac.sh "My VM"      # specify VM name
#   sudo ./setup-vm-forwarding-mac.sh --remove      # uninstall rules
#   sudo ./setup-vm-forwarding-mac.sh --status      # show current state
#
# Ports forwarded:
#   3333  EloPool stratum       4567  EloPool solo
#   3334  ASICSeer stratum      4568  ASICSeer solo
#   80    EloPool web UI        81    ASICSeer web UI
#
# ============================================================================
set -euo pipefail

PORTS="3333 3334 4567 4568 80 81"
PF_ANCHOR="com.startos.mining"
PF_CONF="/etc/pf.anchors/$PF_ANCHOR"
RULE_PREFIX="StartOS-Mining"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!!]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "${CYAN}[>>]${NC} $*"; }

# ── Detect hypervisor ────────────────────────────────────────────────────────
find_hypervisor() {
    if command -v VBoxManage &>/dev/null; then
        echo "virtualbox"
    elif [ -d "/Applications/UTM.app" ]; then
        echo "utm"
    else
        echo ""
    fi
}

# ── Get LAN IP ───────────────────────────────────────────────────────────────
get_lan_ip() {
    # Try en0 (WiFi/Ethernet on most Macs), then en1, etc
    for iface in en0 en1 en2 en3 en4 en5; do
        local ip
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
        if [[ -n "$ip" ]]; then
            echo "$ip"
            return
        fi
    done
    echo ""
}

# ── VirtualBox: find VM ──────────────────────────────────────────────────────
vbox_find_vm() {
    local name="${1:-}"
    if [[ -n "$name" ]]; then
        VBoxManage showvminfo "$name" &>/dev/null || error "VM '$name' not found"
        echo "$name"
        return
    fi
    # Auto-detect
    local vm
    vm=$(VBoxManage list vms 2>/dev/null | grep -iE '".*start|s9|startos' | head -1 | sed 's/^"\(.*\)".*/\1/')
    if [[ -n "$vm" ]]; then
        echo "$vm"
        return
    fi
    warn "Could not auto-detect StartOS VM. Available VMs:"
    VBoxManage list vms 2>/dev/null | sed 's/^/    /'
    echo ""
    error "Specify VM name:  sudo $0 \"<vm-name>\""
}

# ── VirtualBox: setup forwarding ─────────────────────────────────────────────
vbox_setup() {
    local vm="$1"
    step "Setting up VirtualBox NAT port forwarding..."

    local names=("EloPool-Stratum" "ASICSeer-Stratum" "EloPool-Solo" "ASICSeer-Solo" "EloPool-WebUI" "ASICSeer-WebUI")
    local i=0
    for port in $PORTS; do
        local rule_name="${RULE_PREFIX}-${names[$i]}"
        # Remove existing rule first (idempotent)
        VBoxManage modifyvm "$vm" --natpf1 delete "$rule_name" 2>/dev/null || true
        VBoxManage modifyvm "$vm" --natpf1 "${rule_name},tcp,,${port},,${port}"
        info "$rule_name : host:$port -> guest:$port"
        i=$((i + 1))
    done
}

# ── VirtualBox: remove forwarding ────────────────────────────────────────────
vbox_remove() {
    local vm="$1"
    step "Removing VirtualBox port forwarding rules..."
    local names=("EloPool-Stratum" "ASICSeer-Stratum" "EloPool-Solo" "ASICSeer-Solo" "EloPool-WebUI" "ASICSeer-WebUI")
    local i=0
    for port in $PORTS; do
        local rule_name="${RULE_PREFIX}-${names[$i]}"
        VBoxManage modifyvm "$vm" --natpf1 delete "$rule_name" 2>/dev/null || true
        info "Removed $rule_name"
        i=$((i + 1))
    done
}

# ── VirtualBox: status ───────────────────────────────────────────────────────
vbox_status() {
    local vm="$1"
    echo ""
    echo "=== VirtualBox Forwarding Rules for '$vm' ==="
    VBoxManage showvminfo "$vm" --machinereadable 2>/dev/null | grep -i "forward" | grep "$RULE_PREFIX" | sed 's/^/  /' || \
        warn "No StartOS forwarding rules found."
}

# ── UTM/QEMU: setup via pf (packet filter) ──────────────────────────────────
utm_setup() {
    local guest_ip="$1"
    step "Setting up pf (packet filter) port forwarding for UTM..."

    # Build pf anchor rules
    local rules=""
    for port in $PORTS; do
        rules="${rules}rdr pass on lo0 proto tcp from any to any port ${port} -> ${guest_ip} port ${port}\n"
    done

    # Write anchor file
    echo -e "$rules" | sudo tee "$PF_CONF" > /dev/null
    info "pf anchor written: $PF_CONF"

    # Add anchor to main pf.conf if not present
    if ! grep -q "$PF_ANCHOR" /etc/pf.conf 2>/dev/null; then
        step "Adding anchor to /etc/pf.conf..."
        sudo cp /etc/pf.conf /etc/pf.conf.bak.startos
        echo "rdr-anchor \"$PF_ANCHOR\"" | sudo tee -a /etc/pf.conf > /dev/null
        echo "load anchor \"$PF_ANCHOR\" from \"$PF_CONF\"" | sudo tee -a /etc/pf.conf > /dev/null
    fi

    # Enable IP forwarding
    sudo sysctl -w net.inet.ip.forwarding=1 > /dev/null

    # Reload pf
    sudo pfctl -d 2>/dev/null || true
    sudo pfctl -ef /etc/pf.conf 2>/dev/null
    info "pf rules loaded and active"

    warn "UTM note: Make sure your VM network is set to 'Shared Network' (NAT) mode"
}

# ── UTM: remove ──────────────────────────────────────────────────────────────
utm_remove() {
    step "Removing pf forwarding rules..."
    sudo rm -f "$PF_CONF"
    # Remove anchor lines from pf.conf
    if [[ -f /etc/pf.conf.bak.startos ]]; then
        sudo cp /etc/pf.conf.bak.startos /etc/pf.conf
        info "Restored original pf.conf"
    else
        sudo sed -i '' "/$PF_ANCHOR/d" /etc/pf.conf 2>/dev/null || true
    fi
    sudo pfctl -d 2>/dev/null || true
    sudo pfctl -ef /etc/pf.conf 2>/dev/null || true
    info "pf rules removed"
}

# ── UTM: status ──────────────────────────────────────────────────────────────
utm_status() {
    echo ""
    echo "=== pf Forwarding Rules ==="
    if [[ -f "$PF_CONF" ]]; then
        cat "$PF_CONF" | sed 's/^/  /'
    else
        warn "No pf anchor file found"
    fi
    echo ""
    echo "=== pf state ==="
    sudo pfctl -sr 2>/dev/null | grep -i "startos\|mining\|rdr" | sed 's/^/  /' || warn "No active rules"
}

# ── Save info & show popup ──────────────────────────────────────────────────
show_miner_info() {
    local lan_ip="$1"
    local vm_name="$2"
    local hypervisor="$3"

    local info="═══════════════════════════════════════════════════
   MINER CONNECTION INFO — Copy into your miner!
═══════════════════════════════════════════════════

  ┌─ Pool Mining (rewards shared among miners) ──┐
  │                                               │
  │  EloPool:   stratum+tcp://${lan_ip}:3333      │
  │  ASICSeer:  stratum+tcp://${lan_ip}:3334      │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌─ Solo Mining (winner takes all) ─────────────┐
  │                                               │
  │  EloPool:   stratum+tcp://${lan_ip}:4567      │
  │  ASICSeer:  stratum+tcp://${lan_ip}:4568      │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌─ Web Dashboards ─────────────────────────────┐
  │                                               │
  │  EloPool:   http://${lan_ip}:80               │
  │  ASICSeer:  http://${lan_ip}:81               │
  │                                               │
  └───────────────────────────────────────────────┘

  Username:  <your BCH address>
             or <your BCH address>.workername
  Password:  anything (e.g. x)

  VM: ${vm_name} (${hypervisor})
  Generated: $(date '+%Y-%m-%d %H:%M')

  To check status:  sudo $0 --status
  To uninstall:     sudo $0 --remove"

    echo ""
    echo "========================================"
    echo "  Setup Complete!"
    echo "========================================"
    echo "$info"
    echo ""

    # Save to Desktop
    local real_user="${SUDO_USER:-$USER}"
    local desktop="/Users/$real_user/Desktop"
    local txt_file="$desktop/Miner-Connection-Info.txt"

    echo "$info" > "$txt_file"
    chown "$real_user" "$txt_file" 2>/dev/null || true
    chmod 644 "$txt_file"
    info "Saved to: $txt_file"

    # Show popup via osascript (native macOS dialog)
    if command -v osascript &>/dev/null; then
        # Escape for AppleScript
        local escaped
        escaped=$(echo "$info" | sed 's/\\/\\\\/g; s/"/\\"/g')
        sudo -u "$real_user" osascript -e "
            set theText to \"$escaped\"
            display dialog theText with title \"Miner Connection Info\" buttons {\"Copy to Clipboard\", \"OK\"} default button \"OK\"
            if button returned of result is \"Copy to Clipboard\" then
                set the clipboard to theText
            end if
        " 2>/dev/null &
        info "Popup window opened"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#   MAIN
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "  StartOS VM — Port Forwarding Setup (macOS)"
echo "  ==========================================="
echo ""

HYPERVISOR=$(find_hypervisor)
if [[ -z "$HYPERVISOR" ]]; then
    error "No supported hypervisor found. Install VirtualBox or UTM."
fi
info "Detected: $HYPERVISOR"

# ── Status mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--status" ]]; then
    if [[ "$HYPERVISOR" == "virtualbox" ]]; then
        VM=$(vbox_find_vm "${2:-}")
        vbox_status "$VM"
    else
        utm_status
    fi
    exit 0
fi

# ── Remove mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--remove" ]]; then
    if [[ "$HYPERVISOR" == "virtualbox" ]]; then
        VM=$(vbox_find_vm "${2:-}")
        vbox_remove "$VM"
    else
        utm_remove
    fi
    info "All forwarding removed."
    exit 0
fi

# ── Must be root ─────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Run with sudo:  sudo $0"

# ── Setup mode ───────────────────────────────────────────────────────────────
LAN_IP=$(get_lan_ip)
[[ -n "$LAN_IP" ]] || error "Cannot determine your LAN IP"
info "Your LAN IP: $LAN_IP"

if [[ "$HYPERVISOR" == "virtualbox" ]]; then
    VM=$(vbox_find_vm "${1:-}")
    info "Found VM: $VM"

    # VM must be powered off for VBoxManage modifyvm
    VM_STATE=$(VBoxManage showvminfo "$VM" --machinereadable 2>/dev/null | grep "^VMState=" | cut -d'"' -f2)
    if [[ "$VM_STATE" == "running" ]]; then
        warn "VM is running. VirtualBox requires the VM to be stopped to add forwarding rules."
        warn "Please shut down the VM, run this script again, then start it."
        exit 1
    fi

    vbox_setup "$VM"
    show_miner_info "$LAN_IP" "$VM" "VirtualBox"
else
    # UTM — ask for guest IP since UTM doesn't expose it easily
    step "UTM detected. Checking for VM IP..."
    GUEST_IP="${1:-}"
    if [[ -z "$GUEST_IP" || "$GUEST_IP" =~ ^- ]]; then
        echo ""
        echo "  UTM doesn't expose the guest IP programmatically."
        echo "  Find it inside your StartOS VM: System > Network"
        echo ""
        read -rp "  Enter your StartOS VM IP: " GUEST_IP
        echo ""
    fi
    [[ "$GUEST_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || error "Invalid IP: $GUEST_IP"

    utm_setup "$GUEST_IP"
    show_miner_info "$LAN_IP" "StartOS (UTM)" "UTM/QEMU"
fi
