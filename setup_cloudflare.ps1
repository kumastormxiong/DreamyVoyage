param (
    [ValidateSet("1", "2")]
    [string]$Phase = "1"
)

$Domain = "dreamy.voyage"
$DestinationEmail = "kuma.storm.xiong@gmail.com"
$ApiUrl = "https://api.cloudflare.com/client/v4"

# 1. 获取 API Token
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Cloudflare Email Routing 自动化配置" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$ApiToken = Read-Host "请输入您的 Cloudflare API Token (输入时不可见)" -AsSecureString
$ApiTokenStr = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiToken))

if ([string]::IsNullOrWhiteSpace($ApiTokenStr)) {
    Write-Error "API Token 不能为空！"
    exit
}

$Headers = @{
    "Authorization" = "Bearer $ApiTokenStr"
    "Content-Type"  = "application/json"
}

function Invoke-CFApi {
    param (
        [string]$Method,
        [string]$Endpoint,
        [object]$Body = $null
    )
    $url = "$ApiUrl$Endpoint"
    try {
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $Headers -Body $jsonBody -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $Headers -ErrorAction Stop
        }
        return $response
    } catch {
        Write-Error "API 请求失败: $_"
        return $null
    }
}

# 2. 获取 Zone 信息
Write-Host "正在查询域名 $Domain 在 Cloudflare 的状态..."
$zonesRes = Invoke-CFApi -Method "GET" -Endpoint "/zones?name=$Domain"

$ZoneId = $null
$Status = $null
$Nameservers = @()
$AccountId = $null

if ($zonesRes -and $zonesRes.result -and $zonesRes.result.Count -gt 0) {
    $zone = $zonesRes.result[0]
    $ZoneId = $zone.id
    $Status = $zone.status
    $Nameservers = $zone.name_servers
    $AccountId = $zone.account.id
    Write-Host "找到现有域名! Zone ID: $ZoneId, 状态: $Status" -ForegroundColor Green
} else {
    Write-Host "域名 $Domain 未在 Cloudflare 中找到。"
}

if ($Phase -eq "1") {
    # Phase 1: 添加域名与获取 NS
    if (-not $ZoneId) {
        Write-Host "正在获取账户信息..."
        $accountsRes = Invoke-CFApi -Method "GET" -Endpoint "/accounts"
        if (-not $accountsRes -or -not $accountsRes.result -or $accountsRes.result.Count -eq 0) {
            Write-Error "无法获取 Cloudflare 账户列表，请检查 API Token 权限。"
            exit
        }
        $account = $accountsRes.result[0]
        $AccountId = $account.id
        Write-Host "使用账户: $($account.name) (ID: $AccountId)" -ForegroundColor Gray

        Write-Host "正在添加域名 $Domain 到 Cloudflare..."
        $body = @{
            name = $Domain
            account = @{ id = $AccountId }
            type = "full"
        }
        $createZoneRes = Invoke-CFApi -Method "POST" -Endpoint "/zones" -Body $body
        if ($createZoneRes -and $createZoneRes.success) {
            $ZoneId = $createZoneRes.result.id
            $Nameservers = $createZoneRes.result.name_servers
            Write-Host "域名添加成功！" -ForegroundColor Green
        } else {
            Write-Error "添加域名失败。"
            exit
        }
    }

    Write-Host "`n[核心步骤] 请前往 Sav.com 将域名 $Domain 的 Nameservers 修改为：" -ForegroundColor Yellow
    foreach ($ns in $Nameservers) {
        Write-Host "  - $ns" -ForegroundColor Green
    }
    Write-Host "`n修改后，请等待 DNS 生效（通常几分钟到几小时）。"
    Write-Host "确认生效（状态变为 active）后，您可以运行: .\setup_cloudflare.ps1 -Phase 2 继续配置邮件路由。" -ForegroundColor Cyan

} else {
    # Phase 2: 配置邮件路由
    if (-not $ZoneId) {
        Write-Error "域名 $Domain 还未在 Cloudflare 账户中创建，请先运行: .\setup_cloudflare.ps1 -Phase 1"
        exit
    }

    if ($Status -ne "active") {
        Write-Warning "域名状态为: $Status (当前并非 active)。"
        Write-Warning "Cloudflare 尚未检测到您在 Sav.com 修改的 Nameservers。请先修改并等待生效。"
        exit
    }

    Write-Host "域名已激活，开始配置 Email Routing..."

    # 1. 添加目的邮箱地址
    Write-Host "1. 正在添加目标邮箱: $DestinationEmail 到目的地列表..."
    $body = @{
        name = $DestinationEmail
    }
    $addAddressRes = Invoke-CFApi -Method "POST" -Endpoint "/accounts/$AccountId/email/routing/addresses" -Body $body
    if ($addAddressRes -and $addAddressRes.success) {
        Write-Host "目标邮箱添加成功！请去该邮箱查收验证邮件并点击验证。" -ForegroundColor Green
    } else {
        Write-Host "目标邮箱已存在或您已验证，继续下一步..." -ForegroundColor Gray
    }

    # 2. 启用 Email Routing 并自动加 DNS
    Write-Host "2. 正在启用 Email Routing 加锁 DNS 记录..."
    $dnsRes = Invoke-CFApi -Method "POST" -Endpoint "/zones/$ZoneId/email/routing/dns"
    if ($dnsRes -and $dnsRes.success) {
        Write-Host "Email Routing 已开启，且 DNS (MX/SPF) 记录已自动添加！" -ForegroundColor Green
    } else {
        Write-Host "Email Routing 已开启或记录已存在，继续下一步..." -ForegroundColor Gray
    }

    # 3. 创建转发规则 Rules
    Write-Host "3. 正在创建转发规则: contact@$Domain -> $DestinationEmail ..."
    $bodyRule = @{
        actions = @(
            @{
                type = "forward"
                value = @( $DestinationEmail )
            }
        )
        enabled = $true
        matchers = @(
            @{
                type = "literal"
                field = "to"
                value = "contact@$Domain"
            }
        )
        name = "Forward contact to Gmail"
    }
    $ruleRes = Invoke-CFApi -Method "POST" -Endpoint "/zones/$ZoneId/email/routing/rules" -Body $bodyRule
    if ($ruleRes -and $ruleRes.success) {
        Write-Host "转发规则添加成功！" -ForegroundColor Green
    } else {
         Write-Warning "转发规则添加未成功，可能已有同名规则。"
    }

    Write-Host "`n配置完成！" -ForegroundColor Green
    Write-Host "请确保："
    Write-Host "1. 已经在 $DestinationEmail 邮箱中点击了验证链接。"
    Write-Host "2. 通过外部邮箱向 contact@$Domain 发送一封测试邮件验证。" -ForegroundColor Yellow
}
