#Requires -RunAsAdministrator
<#
.SYNOPSIS
    StartOS VM — Port Forwarding Setup for Windows
.DESCRIPTION
    One-command setup for forwarding mining ports from your Windows PC to a
    StartOS VM running in VirtualBox or Hyper-V.

    Supports:
      - VirtualBox (auto-detected via VBoxManage)
      - Hyper-V (auto-detected via Get-VM)

    Ports forwarded:
      3333  EloPool stratum       4567  EloPool solo
      3334  ASICSeer stratum      4568  ASICSeer solo
      80    EloPool web UI        81    ASICSeer web UI

.PARAMETER VMName
    Name of the VM. If omitted, auto-detects a StartOS VM.
.PARAMETER Remove
    Remove all port forwarding rules.
.PARAMETER Status
    Show current forwarding state.
.EXAMPLE
    .\setup-vm-forwarding.ps1
.EXAMPLE
    .\setup-vm-forwarding.ps1 -VMName "StartOS"
.EXAMPLE
    .\setup-vm-forwarding.ps1 -Remove
#>

param(
    [string]$VMName,
    [switch]$Remove,
    [switch]$Status
)

$ErrorActionPreference = "Stop"

$PORTS = @(
    @{ Port = 3333; Name = "EloPool-Stratum" },
    @{ Port = 3334; Name = "ASICSeer-Stratum" },
    @{ Port = 4567; Name = "EloPool-Solo" },
    @{ Port = 4568; Name = "ASICSeer-Solo" },
    @{ Port = 80;   Name = "EloPool-WebUI" },
    @{ Port = 81;   Name = "ASICSeer-WebUI" }
)

$RULE_PREFIX = "StartOS-Mining"

# ── Detect hypervisor ────────────────────────────────────────────────────────
function Find-Hypervisor {
    $vboxManage = $null
    # Check standard VirtualBox locations
    foreach ($path in @(
        "$env:ProgramFiles\Oracle\VirtualBox\VBoxManage.exe",
        "${env:ProgramFiles(x86)}\Oracle\VirtualBox\VBoxManage.exe",
        "VBoxManage.exe"
    )) {
        if (Get-Command $path -ErrorAction SilentlyContinue) {
            return @{ Type = "VirtualBox"; Path = $path }
        }
    }
    # Check Hyper-V
    if (Get-Command Get-VM -ErrorAction SilentlyContinue) {
        return @{ Type = "HyperV"; Path = $null }
    }
    return $null
}

# ── VirtualBox helpers ───────────────────────────────────────────────────────
function VBox-FindVM {
    param([string]$VBoxManage, [string]$Name)
    if ($Name) {
        $info = & $VBoxManage showvminfo $Name --machinereadable 2>$null
        if ($LASTEXITCODE -eq 0) { return $Name }
        Write-Host "[ERROR] VM '$Name' not found." -ForegroundColor Red
        exit 1
    }
    # Auto-detect
    $vms = & $VBoxManage list vms 2>$null | ForEach-Object {
        if ($_ -match '"(.+?)"') { $Matches[1] }
    }
    foreach ($vm in $vms) {
        if ($vm -match "(?i)start|s9|startos") { return $vm }
    }
    Write-Host "[!!] Could not auto-detect StartOS VM. Available VMs:" -ForegroundColor Yellow
    $vms | ForEach-Object { Write-Host "    $_" }
    Write-Host ""
    Write-Host "Run:  .\setup-vm-forwarding.ps1 -VMName ""<vm-name>""" -ForegroundColor Cyan
    exit 1
}

function VBox-GetGuestIP {
    param([string]$VBoxManage, [string]$VM)
    $props = & $VBoxManage guestproperty enumerate $VM 2>$null
    foreach ($line in $props) {
        if ($line -match "/VirtualBox/GuestInfo/Net/\d+/V4/IP.*value:\s*([\d\.]+)") {
            return $Matches[1]
        }
    }
    # fallback: check DHCP leases from NAT
    return $null
}

function VBox-SetupForwarding {
    param([string]$VBoxManage, [string]$VM)

    Write-Host "[>>] Setting up VirtualBox NAT port forwarding..." -ForegroundColor Cyan

    # Ensure NAT adapter on NIC 1
    $info = & $VBoxManage showvminfo $VM --machinereadable 2>$null
    $natFound = $false
    foreach ($line in $info) {
        if ($line -match "^nic\d+=.*(nat)" ) { $natFound = $true; break }
    }

    # Remove existing rules first (idempotent)
    foreach ($p in $PORTS) {
        $ruleName = "$RULE_PREFIX-$($p.Name)"
        & $VBoxManage modifyvm $VM --natpf1 delete $ruleName 2>$null
    }

    # Add forwarding rules
    foreach ($p in $PORTS) {
        $ruleName = "$RULE_PREFIX-$($p.Name)"
        $port = $p.Port
        & $VBoxManage modifyvm $VM --natpf1 "$ruleName,tcp,,$port,,$port"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] $ruleName : host:$port -> guest:$port" -ForegroundColor Green
        } else {
            Write-Host "[!!] Failed to add rule for port $port" -ForegroundColor Yellow
        }
    }
}

function VBox-RemoveForwarding {
    param([string]$VBoxManage, [string]$VM)
    Write-Host "[>>] Removing VirtualBox port forwarding rules..." -ForegroundColor Cyan
    foreach ($p in $PORTS) {
        $ruleName = "$RULE_PREFIX-$($p.Name)"
        & $VBoxManage modifyvm $VM --natpf1 delete $ruleName 2>$null
        Write-Host "[OK] Removed $ruleName" -ForegroundColor Green
    }
}

function VBox-ShowStatus {
    param([string]$VBoxManage, [string]$VM)
    Write-Host "`n=== VirtualBox Forwarding Rules for '$VM' ===" -ForegroundColor Cyan
    $info = & $VBoxManage showvminfo $VM --machinereadable 2>$null
    $found = $false
    foreach ($line in $info) {
        if ($line -match "Forwarding" -and $line -match $RULE_PREFIX) {
            Write-Host "  $line"
            $found = $true
        }
    }
    if (-not $found) { Write-Host "  No StartOS forwarding rules found." -ForegroundColor Yellow }
}

# ── Hyper-V helpers ──────────────────────────────────────────────────────────
function HyperV-FindVM {
    param([string]$Name)
    if ($Name) {
        $vm = Get-VM -Name $Name -ErrorAction SilentlyContinue
        if ($vm) { return $Name }
        Write-Host "[ERROR] VM '$Name' not found." -ForegroundColor Red
        exit 1
    }
    $vms = Get-VM | Select-Object -ExpandProperty Name
    foreach ($vm in $vms) {
        if ($vm -match "(?i)start|s9|startos") { return $vm }
    }
    Write-Host "[!!] Could not auto-detect StartOS VM. Available VMs:" -ForegroundColor Yellow
    $vms | ForEach-Object { Write-Host "    $_" }
    exit 1
}

function HyperV-GetGuestIP {
    param([string]$VM)
    $adapters = Get-VMNetworkAdapter -VMName $VM -ErrorAction SilentlyContinue
    foreach ($a in $adapters) {
        foreach ($ip in $a.IPAddresses) {
            if ($ip -match "^\d+\.\d+\.\d+\.\d+$") { return $ip }
        }
    }
    return $null
}

function HyperV-SetupForwarding {
    param([string]$VM)
    Write-Host "[>>] Setting up Hyper-V port forwarding (netsh portproxy)..." -ForegroundColor Cyan

    $guestIP = HyperV-GetGuestIP -VM $VM
    if (-not $guestIP) {
        Write-Host "[ERROR] Cannot detect VM IP. Make sure the VM is running." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] VM IP: $guestIP" -ForegroundColor Green

    foreach ($p in $PORTS) {
        $port = $p.Port
        # Remove existing first
        netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
        netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$guestIP
        Write-Host "[OK] $($p.Name) : 0.0.0.0:$port -> ${guestIP}:$port" -ForegroundColor Green
    }

    # Add firewall rules
    $fwName = "$RULE_PREFIX-Inbound"
    Remove-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue 2>$null
    $portList = ($PORTS | ForEach-Object { $_.Port }) -join ","
    New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP `
        -LocalPort $portList -Action Allow -Profile Private,Domain | Out-Null
    Write-Host "[OK] Firewall rule added: $fwName" -ForegroundColor Green

    return $guestIP
}

function HyperV-RemoveForwarding {
    Write-Host "[>>] Removing Hyper-V port forwarding..." -ForegroundColor Cyan
    foreach ($p in $PORTS) {
        netsh interface portproxy delete v4tov4 listenport=$($p.Port) listenaddress=0.0.0.0 2>$null
        Write-Host "[OK] Removed port $($p.Port)" -ForegroundColor Green
    }
    Remove-NetFirewallRule -DisplayName "$RULE_PREFIX-Inbound" -ErrorAction SilentlyContinue 2>$null
    Write-Host "[OK] Firewall rule removed" -ForegroundColor Green
}

function HyperV-ShowStatus {
    Write-Host "`n=== Hyper-V Port Proxy Rules ===" -ForegroundColor Cyan
    netsh interface portproxy show v4tov4
    Write-Host "`n=== Firewall Rules ===" -ForegroundColor Cyan
    Get-NetFirewallRule -DisplayName "$RULE_PREFIX*" -ErrorAction SilentlyContinue |
        Format-Table DisplayName, Enabled, Direction, Action -AutoSize
}

# ── Get local LAN IP ────────────────────────────────────────────────────────
function Get-LanIP {
    $adapters = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.InterfaceAlias -notmatch "Loopback|vEthernet.*Default|Hyper-V" -and
            $_.IPAddress -notmatch "^127\." -and
            $_.IPAddress -notmatch "^169\.254\." -and
            $_.PrefixOrigin -ne "WellKnown"
        } | Sort-Object -Property InterfaceIndex
    foreach ($a in $adapters) {
        return $a.IPAddress
    }
    return "YOUR_PC_IP"
}

# ── Save info & show popup ──────────────────────────────────────────────────
function Show-MinerInfo {
    param([string]$LanIP, [string]$VM, [string]$Hypervisor)

    $info = @"
===================================================
   MINER CONNECTION INFO - Copy into your miner!
===================================================

  --- Pool Mining (rewards shared among miners) ---

  EloPool:   stratum+tcp://${LanIP}:3333
  ASICSeer:  stratum+tcp://${LanIP}:3334

  --- Solo Mining (winner takes all) ---------------

  EloPool:   stratum+tcp://${LanIP}:4567
  ASICSeer:  stratum+tcp://${LanIP}:4568

  --- Web Dashboards --------------------------------

  EloPool:   http://${LanIP}:80
  ASICSeer:  http://${LanIP}:81

  Username:  <your BCH address>
             or <your BCH address>.workername
  Password:  anything (e.g. x)

===================================================
  VM: $VM ($Hypervisor)
  Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm")

  To check status:  .\setup-vm-forwarding.ps1 -Status
  To uninstall:     .\setup-vm-forwarding.ps1 -Remove
===================================================
"@

    # Print to terminal
    Write-Host ""
    Write-Host $info -ForegroundColor White

    # Save to Desktop
    $desktop = [Environment]::GetFolderPath("Desktop")
    $txtFile = Join-Path $desktop "Miner-Connection-Info.txt"
    $info | Set-Content -Path $txtFile -Encoding UTF8
    Write-Host "[OK] Saved to: $txtFile" -ForegroundColor Green

    # Show popup (Windows Forms messagebox with copyable text)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Miner Connection Info - Copy for your ASIC!"
        $form.Size = New-Object System.Drawing.Size(620, 560)
        $form.StartPosition = "CenterScreen"
        $form.TopMost = $true

        $textbox = New-Object System.Windows.Forms.TextBox
        $textbox.Multiline = $true
        $textbox.ReadOnly = $true
        $textbox.ScrollBars = "Vertical"
        $textbox.Font = New-Object System.Drawing.Font("Consolas", 10)
        $textbox.Dock = "Fill"
        $textbox.Text = $info
        $textbox.SelectAll()

        $form.Controls.Add($textbox)
        $form.Add_Shown({ $form.Activate() })
        [void]$form.ShowDialog()
    } catch {
        Write-Host "[!!] Could not show popup window. Info saved to Desktop." -ForegroundColor Yellow
    }
}

# ══════════════════════════════════════════════════════════════════════════════
#   MAIN
# ══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  StartOS VM - Port Forwarding Setup" -ForegroundColor Cyan
Write-Host "  ===================================" -ForegroundColor Cyan
Write-Host ""

$hv = Find-Hypervisor
if (-not $hv) {
    Write-Host "[ERROR] No supported hypervisor found." -ForegroundColor Red
    Write-Host "        Install VirtualBox or enable Hyper-V." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Detected: $($hv.Type)" -ForegroundColor Green

# ── Status mode ──────────────────────────────────────────────────────────────
if ($Status) {
    if ($hv.Type -eq "VirtualBox") {
        $vm = VBox-FindVM -VBoxManage $hv.Path -Name $VMName
        VBox-ShowStatus -VBoxManage $hv.Path -VM $vm
    } else {
        HyperV-ShowStatus
    }
    exit 0
}

# ── Remove mode ──────────────────────────────────────────────────────────────
if ($Remove) {
    if ($hv.Type -eq "VirtualBox") {
        $vm = VBox-FindVM -VBoxManage $hv.Path -Name $VMName
        VBox-RemoveForwarding -VBoxManage $hv.Path -VM $vm
    } else {
        HyperV-RemoveForwarding
    }
    Write-Host "`n[OK] All forwarding removed." -ForegroundColor Green
    exit 0
}

# ── Setup mode ───────────────────────────────────────────────────────────────
$lanIP = Get-LanIP
Write-Host "[OK] Your LAN IP: $lanIP" -ForegroundColor Green

if ($hv.Type -eq "VirtualBox") {
    $vm = VBox-FindVM -VBoxManage $hv.Path -Name $VMName
    Write-Host "[OK] Found VM: $vm" -ForegroundColor Green
    VBox-SetupForwarding -VBoxManage $hv.Path -VM $vm
    Show-MinerInfo -LanIP $lanIP -VM $vm -Hypervisor "VirtualBox"
} else {
    $vm = HyperV-FindVM -Name $VMName
    Write-Host "[OK] Found VM: $vm" -ForegroundColor Green
    HyperV-SetupForwarding -VM $vm | Out-Null
    Show-MinerInfo -LanIP $lanIP -VM $vm -Hypervisor "Hyper-V"
}
