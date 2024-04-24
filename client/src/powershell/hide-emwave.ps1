# Used to hide emwave
param(
    [string]$emwvProcId
)

# Function to maximize/minimize/hide etc. a given window
# Modified version of https://gist.github.com/jakeballard/11240204
# Usage: Set-WindowStyle <Style> <ProcessId>
# Operates on whatever the MainWindowHandle of ProcessId is
function Set-WindowStyle {
param(
    [Parameter()]
    [ValidateSet('FORCEMINIMIZE', 'HIDE', 'MAXIMIZE', 'MINIMIZE', 'RESTORE', 
                 'SHOW', 'SHOWDEFAULT', 'SHOWMAXIMIZED', 'SHOWMINIMIZED', 
                 'SHOWMINNOACTIVE', 'SHOWNA', 'SHOWNOACTIVATE', 'SHOWNORMAL')]
    $Style = 'SHOW',

    [Parameter()]
    $ProcId,
    
    [Parameter()]
    $MainWindowHandle = (Get-Process -id $ProcId).MainWindowHandle
)
    $WindowStates = @{
        'FORCEMINIMIZE'   = 11
        'HIDE'            = 0
        'MAXIMIZE'        = 3
        'MINIMIZE'        = 6
        'RESTORE'         = 9
        'SHOW'            = 5
        'SHOWDEFAULT'     = 10
        'SHOWMAXIMIZED'   = 3
        'SHOWMINIMIZED'   = 2
        'SHOWMINNOACTIVE' = 7
        'SHOWNA'          = 8
        'SHOWNOACTIVATE'  = 4
        'SHOWNORMAL'      = 1
    }
    
    $Win32ShowWindowAsync = Add-Type -memberDefinition @"
    [DllImport("user32.dll")] 
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); 
"@ -name "Win32ShowWindowAsync" -namespace Win32Functions -passThru
    
    $Win32ShowWindowAsync::ShowWindowAsync($MainWindowHandle, $WindowStates[$Style]) | Out-Null
    Write-Verbose ("Set Window Style '{1} on '{0}'" -f $MainWindowHandle, $Style)

}

# hide emWave
Set-WindowStyle HIDE $emwvProcId
