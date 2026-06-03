param(
    [int]$Port = 8765,
    [switch]$NoOpenBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$staticRoot = Join-Path $root 'web-editor'
$opmlPath = Join-Path $root 'favorites.opml'
$backupDir = Join-Path $root 'backups'

if (-not (Test-Path $staticRoot)) {
    throw "Static folder not found: $staticRoot"
}

if (-not (Test-Path $opmlPath)) {
    throw "OPML file not found: $opmlPath"
}

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
}

function Write-JsonResponse {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)]$Object,
        [int]$StatusCode = 200
    )

    $json = $Object | ConvertTo-Json -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = 'application/json; charset=utf-8'
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Read-BodyText {
    param([Parameter(Mandatory)]$Request)
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    try {
        return $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }
}

function Write-OpmlFile {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content
    )

    $directory = Split-Path -Parent $Path
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Test-StreamUrl {
    param(
        [Parameter(Mandatory)][string]$Url
    )

    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = 'HEAD'
        $request.Timeout = 7000
        $request.AllowAutoRedirect = $true
        $response = $request.GetResponse()
        try {
            $status = [int]$response.StatusCode
            if ($status -ge 200 -and $status -lt 400) {
                return @{ ok = $true; status = $status; mode = 'HEAD' }
            }
        }
        finally {
            $response.Close()
        }
    }
    catch {
        # Fallback to GET because some radio servers reject HEAD.
    }

    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = 'GET'
        $request.Timeout = 9000
        $request.ReadWriteTimeout = 9000
        $request.AllowAutoRedirect = $true
        $response = $request.GetResponse()
        try {
            $status = [int]$response.StatusCode
            if ($status -ge 200 -and $status -lt 400) {
                return @{ ok = $true; status = $status; mode = 'GET' }
            }
            return @{ ok = $false; status = $status; mode = 'GET' }
        }
        finally {
            $response.Close()
        }
    }
    catch {
        return @{ ok = $false; status = $null; mode = 'GET'; error = $_.Exception.Message }
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

$script:ShouldStop = $false
[Console]::TreatControlCAsInput = $false
$cancelHandler = [ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $script:ShouldStop = $true
    $eventArgs.Cancel = $true
    try {
        $listener.Stop()
    }
    catch {
    }
}
[Console]::add_CancelKeyPress($cancelHandler)

Write-Host "Lyrion Favorites Editor is running at http://localhost:$Port"
Write-Host "Press Ctrl+C to stop."

if (-not $NoOpenBrowser) {
    Start-Process "http://localhost:$Port"
}

try {
    while ($listener.IsListening -and -not $script:ShouldStop) {
        $contextAsync = $listener.BeginGetContext($null, $null)

        while (-not $script:ShouldStop) {
            if ($contextAsync.AsyncWaitHandle.WaitOne(250)) {
                $context = $null
                try {
                    $context = $listener.EndGetContext($contextAsync)
                }
                catch {
                    break
                }

                if (-not $context) {
                    break
                }

                $request = $context.Request
                $response = $context.Response

                try {
                    $path = $request.Url.AbsolutePath
                    $method = $request.HttpMethod.ToUpperInvariant()

                    if ($path -eq '/api/health' -and $method -eq 'GET') {
                        Write-JsonResponse -Response $response -Object @{ ok = $true; time = (Get-Date).ToString('o') }
                        continue
                    }

                    if ($path -eq '/api/load' -and $method -eq 'GET') {
                        $content = Get-Content -Raw -Path $opmlPath -Encoding UTF8
                        Write-JsonResponse -Response $response -Object @{ ok = $true; file = 'favorites.opml'; content = $content }
                        continue
                    }

                    if ($path -eq '/api/save' -and $method -eq 'POST') {
                        $bodyText = Read-BodyText -Request $request
                        $payload = $bodyText | ConvertFrom-Json
                        $content = [string]$payload.content

                        if ([string]::IsNullOrWhiteSpace($content)) {
                            Write-JsonResponse -Response $response -StatusCode 400 -Object @{ ok = $false; error = 'Empty content.' }
                            continue
                        }

                        try {
                            $null = [xml]$content
                        }
                        catch {
                            Write-JsonResponse -Response $response -StatusCode 400 -Object @{ ok = $false; error = 'Invalid XML.' }
                            continue
                        }

                        if (-not ($content -match '<opml')) {
                            Write-JsonResponse -Response $response -StatusCode 400 -Object @{ ok = $false; error = 'Not an OPML document.' }
                            continue
                        }

                        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                        $backupPath = Join-Path $backupDir ("favorites-$stamp.opml")
                        Copy-Item -Path $opmlPath -Destination $backupPath -Force

                        Write-OpmlFile -Path $opmlPath -Content $content

                        Write-JsonResponse -Response $response -Object @{
                            ok = $true
                            file = 'favorites.opml'
                            backup = (Split-Path -Leaf $backupPath)
                        }
                        continue
                    }

                    if ($path -eq '/api/check' -and $method -eq 'POST') {
                        $bodyText = Read-BodyText -Request $request
                        $payload = $bodyText | ConvertFrom-Json
                        $url = [string]$payload.url

                        if ([string]::IsNullOrWhiteSpace($url)) {
                            Write-JsonResponse -Response $response -StatusCode 400 -Object @{ ok = $false; error = 'URL is required.' }
                            continue
                        }

                        $result = Test-StreamUrl -Url $url
                        Write-JsonResponse -Response $response -Object $result
                        continue
                    }

                    $resolved = if ($path -eq '/' -or [string]::IsNullOrEmpty($path)) {
                        Join-Path $staticRoot 'index.html'
                    }
                    else {
                        $trimmed = $path.TrimStart('/')
                        $candidate = Join-Path $staticRoot $trimmed
                        [System.IO.Path]::GetFullPath($candidate)
                    }

                    $fullStaticRoot = [System.IO.Path]::GetFullPath($staticRoot)
                    $fullResolved = [System.IO.Path]::GetFullPath($resolved)

                    if (-not $fullResolved.StartsWith($fullStaticRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                        Write-JsonResponse -Response $response -StatusCode 403 -Object @{ ok = $false; error = 'Forbidden.' }
                        continue
                    }

                    if (-not (Test-Path $fullResolved -PathType Leaf)) {
                        Write-JsonResponse -Response $response -StatusCode 404 -Object @{ ok = $false; error = 'Not found.' }
                        continue
                    }

                    $ext = [System.IO.Path]::GetExtension($fullResolved).ToLowerInvariant()
                    $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
                    $bytes = [System.IO.File]::ReadAllBytes($fullResolved)

                    $response.StatusCode = 200
                    $response.ContentType = $contentType
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    $response.OutputStream.Close()
                }
                catch {
                    if ($response.OutputStream.CanWrite) {
                        Write-JsonResponse -Response $response -StatusCode 500 -Object @{ ok = $false; error = $_.Exception.Message }
                    }
                }
            }
        }
    }
}
finally {
    [Console]::remove_CancelKeyPress($cancelHandler)
    $listener.Stop()
    $listener.Close()
}
