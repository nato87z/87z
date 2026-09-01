param(
  [Parameter(Mandatory=$true)][string]$DllPath
)

$ErrorActionPreference = 'Stop'

# ViGEmClient API: the target allocated by vigem_target_x360_alloc() is explicitly
# the Microsoft Xbox 360 wired target (VID 045E / PID 028E).
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ZVigemNative {
    [StructLayout(LayoutKind.Sequential, Pack=1)]
    public struct XUSB_REPORT {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern IntPtr vigem_alloc();
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern void vigem_free(IntPtr client);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_connect(IntPtr client);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern void vigem_disconnect(IntPtr client);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern IntPtr vigem_target_x360_alloc();
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_add(IntPtr client, IntPtr target);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_remove(IntPtr client, IntPtr target);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern void vigem_target_free(IntPtr target);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_x360_update(IntPtr client, IntPtr target, XUSB_REPORT report);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern bool vigem_target_is_attached(IntPtr target);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_x360_get_user_index(IntPtr client, IntPtr target, out uint index);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_get_index(IntPtr target);
    [DllImport("ViGEmClient.dll", ExactSpelling=true, CallingConvention=CallingConvention.Cdecl)]
    public static extern uint vigem_target_get_type(IntPtr target);
}

public static class ZXInputNative {
    [StructLayout(LayoutKind.Sequential, Pack=1)]
    public struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }
    [StructLayout(LayoutKind.Sequential, Pack=1)]
    public struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }
    [DllImport("xinput1_4.dll", ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern uint XInputGetState(uint userIndex, ref XINPUT_STATE state);
    [DllImport("xinput1_3.dll", ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern uint XInputGetState13(uint userIndex, ref XINPUT_STATE state);
}
"@

$dllFull = [System.IO.Path]::GetFullPath($DllPath)
$dllDir = [System.IO.Path]::GetDirectoryName($dllFull)
[Environment]::CurrentDirectory = $dllDir
$env:PATH = "$dllDir;$env:PATH"

function Emit($obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 8
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

function Get-XInputSlots {
    $slots = @()
    for ($i = 0; $i -lt 4; $i++) {
        $state = New-Object ZXInputNative+XINPUT_STATE
        $ok = $false
        $rc = 1167
        try {
            $rc = [ZXInputNative]::XInputGetState([uint32]$i, [ref]$state)
            $ok = ($rc -eq 0)
        } catch {
            try {
                $rc = [ZXInputNative]::XInputGetState13([uint32]$i, [ref]$state)
                $ok = ($rc -eq 0)
            } catch { }
        }
        $slots += [pscustomobject]@{ slot=$i; connected=$ok; code=('0x{0:X8}' -f [uint32]$rc) }
    }
    return $slots
}

function Get-X360UserIndex {
    $idx = [uint32]::MaxValue
    try {
        $rc = [ZVigemNative]::vigem_target_x360_get_user_index($client, $target, [ref]$idx)
        return [pscustomobject]@{ success=($rc -eq 0x20000000); code=('0x{0:X8}' -f [uint32]$rc); index=$idx }
    } catch {
        return [pscustomobject]@{ success=$false; code='exception'; index=$idx; error=$_.Exception.Message }
    }
}

$client = [IntPtr]::Zero
$target = [IntPtr]::Zero
$connected = $false
$lastXInput = $null

try {
    if (-not (Test-Path -LiteralPath $dllFull)) { throw "ViGEmClient.dll não encontrado: $dllFull" }

    $client = [ZVigemNative]::vigem_alloc()
    if ($client -eq [IntPtr]::Zero) { throw 'vigem_alloc falhou.' }

    $rc = [ZVigemNative]::vigem_connect($client)
    if ($rc -ne 0x20000000) { throw ('vigem_connect falhou: 0x{0:X8}' -f $rc) }

    $target = [ZVigemNative]::vigem_target_x360_alloc()
    if ($target -eq [IntPtr]::Zero) { throw 'vigem_target_x360_alloc falhou.' }

    # Do NOT override VID/PID here. vigem_target_x360_alloc() already creates
    # the native Microsoft Xbox 360 wired target. The official client examples
    # allocate the X360 target and add it directly to the bus.
    $rc = [ZVigemNative]::vigem_target_add($client, $target)
    if ($rc -ne 0x20000000) { throw ('vigem_target_add falhou: 0x{0:X8}' -f $rc) }

    if (-not [ZVigemNative]::vigem_target_is_attached($target)) {
        throw 'O alvo Xbox 360 foi criado, mas não ficou anexado ao ViGEmBus.'
    }

    $connected = $true
    $targetIndex = [ZVigemNative]::vigem_target_get_index($target)
    $targetType = [ZVigemNative]::vigem_target_get_type($target)
    $user = Get-X360UserIndex
    $lastXInput = Get-XInputSlots

    # XInput can take a short moment to enumerate the newly plugged virtual pad.
    # Poll it for a few seconds, but never tear down the ViGEm target merely because
    # XInput has not enumerated it yet. The bus attachment is the authoritative state.
    $deadline = (Get-Date).AddSeconds(3)
    while (-not $user.success -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 100
        $user = Get-X360UserIndex
        $lastXInput = Get-XInputSlots
    }

    Emit @{ type='status'; connected=$true; controller='Xbox 360 Controller'; protocol='XInput'; attached=$true; targetIndex=$targetIndex; targetType=$targetType; userIndex=($(if($user.success){$user.index}else{$null})); userIndexStatus=$user; xinput=$lastXInput; message='XBOX 360 VIRTUAL CONECTADO'; code='0x20000000' }

    $neutral = New-Object ZVigemNative+XUSB_REPORT
    $rc = [ZVigemNative]::vigem_target_x360_update($client, $target, $neutral)
    if ($rc -ne 0x20000000) { throw ('Primeiro relatório XUSB falhou: 0x{0:X8}' -f $rc) }

    $heartbeat = Get-Date
    while (($line = [Console]::In.ReadLine()) -ne $null) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $cmd = $line | ConvertFrom-Json
            if ($cmd.type -eq 'stop') { break }
            if ($cmd.type -ne 'report') { continue }

            $r = New-Object ZVigemNative+XUSB_REPORT
            $r.wButtons = [uint16]$cmd.wButtons
            $r.bLeftTrigger = [byte]$cmd.bLeftTrigger
            $r.bRightTrigger = [byte]$cmd.bRightTrigger
            $r.sThumbLX = [int16]$cmd.sThumbLX
            $r.sThumbLY = [int16]$cmd.sThumbLY
            $r.sThumbRX = [int16]$cmd.sThumbRX
            $r.sThumbRY = [int16]$cmd.sThumbRY

            $rc = [ZVigemNative]::vigem_target_x360_update($client, $target, $r)
            if ($rc -ne 0x20000000) {
                Emit @{ type='status'; connected=$false; error=('ViGEm recusou o relatório XUSB: 0x{0:X8}' -f $rc); xinput=Get-XInputSlots }
                break
            }

            if (((Get-Date) - $heartbeat).TotalMilliseconds -ge 1000) {
                $heartbeat = Get-Date
                $attached = [ZVigemNative]::vigem_target_is_attached($target)
                $lastXInput = Get-XInputSlots
                if (-not $attached) {
                    Emit @{ type='status'; connected=$false; error='O alvo Xbox 360 deixou de estar anexado ao ViGEmBus.'; xinput=$lastXInput }
                    break
                }
                Emit @{ type='diagnostic'; attached=$attached; xinput=$lastXInput }
            }
        } catch {
            Emit @{ type='status'; connected=$false; error=('Comando inválido: ' + $_.Exception.Message) }
        }
    }
}
catch {
    Emit @{ type='status'; connected=$false; error=$_.Exception.Message; xinput=Get-XInputSlots }
    exit 1
}
finally {
    if ($target -ne [IntPtr]::Zero) {
        try { if ($connected) { [void][ZVigemNative]::vigem_target_remove($client, $target) } } catch {}
        try { [ZVigemNative]::vigem_target_free($target) } catch {}
    }
    if ($client -ne [IntPtr]::Zero) {
        try { [ZVigemNative]::vigem_disconnect($client) } catch {}
        try { [ZVigemNative]::vigem_free($client) } catch {}
    }
}
