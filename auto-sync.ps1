# Blog Auto Sync Script
# 트리거 파일을 감시하고 발견 시 git pull 실행

# 설정
$blogPath = "D:\blog"
$downloadsPath = "$env:USERPROFILE\Downloads"
$triggerFile = ".blog-sync-trigger"
$logFile = "$blogPath\sync.log"

# 로그 함수
function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $logFile -Value $logMessage
}

# 트리거 파일 확인
$triggerPath = Join-Path $downloadsPath $triggerFile

if (Test-Path $triggerPath) {
    Write-Log "✅ 트리거 파일 발견: $triggerPath"
    
    # 트리거 파일 내용 읽기
    $triggerContent = Get-Content $triggerPath -Raw
    Write-Log "트리거 정보: $triggerContent"
    
    # Git Pull 실행
    Write-Log "🔄 Git Pull 시작..."
    
    Set-Location $blogPath
    
    $pullOutput = git pull origin main 2>&1
    $pullExitCode = $LASTEXITCODE
    
    if ($pullExitCode -eq 0) {
        Write-Log "✅ Git Pull 성공!"
        Write-Log $pullOutput
        
        # 트리거 파일 삭제
        Remove-Item $triggerPath -Force
        Write-Log "🗑️  트리거 파일 삭제 완료"
        
        # 성공 알림 (선택사항)
        Write-Log "📁 블로그 로컬 폴더 동기화 완료!"
        
    } else {
        Write-Log "❌ Git Pull 실패: $pullOutput"
    }
    
} else {
    # 트리거 파일 없음 - 아무것도 안 함
    # Write-Log "트리거 파일 없음 (정상)"
}