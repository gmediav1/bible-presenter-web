# Repariert eine defekte Bible-Presenter-Installation (Windows 10/11).
# Entfernt nur Programmdateien, Startmenü-Verknüpfungen und den zugehörigen
# Eintrag in „Programme und Features“. Eigene Einstellungen/Caches bleiben erhalten.

$ErrorActionPreference = "Stop"
$appName = "Bible Presenter"
$publisher = "Gwinn Media"

Write-Host "`nBible Presenter – Reparatur" -ForegroundColor Cyan

# Die Anwendung kann Dateien sperren, daher zuerst alle ihre Prozesse beenden.
Get-Process -Name "Bible Presenter" -ErrorAction SilentlyContinue | Stop-Process -Force

# Nur die bekannten Installationsordner dieser App. Der Einstellungsordner unter
# AppData\Roaming wird absichtlich nicht angefasst.
$installFolders = @(
  (Join-Path $env:LOCALAPPDATA "Programs\\Bible Presenter"),
  (Join-Path $env:ProgramFiles "Bible Presenter"),
  (Join-Path ${env:ProgramFiles(x86)} "Bible Presenter")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($folder in $installFolders) {
  Write-Host "Entferne Programmordner: $folder"
  Remove-Item -LiteralPath $folder -Recurse -Force
}

# Verwaiste Verknüpfungen entfernen.
$shortcuts = @(
  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\Bible Presenter.lnk"),
  (Join-Path $env:USERPROFILE "Desktop\\Bible Presenter.lnk")
)
foreach ($shortcut in $shortcuts) {
  if (Test-Path -LiteralPath $shortcut) {
    Remove-Item -LiteralPath $shortcut -Force
  }
}

# Ausschließlich den Eintrag mit exakt diesem Anzeigenamen und Herausgeber entfernen.
$uninstallRoots = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)

$removedEntries = 0
foreach ($root in $uninstallRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root | ForEach-Object {
    $entry = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
    if ($entry.DisplayName -eq $appName -and $entry.Publisher -eq $publisher) {
      Write-Host "Entferne defekten Windows-Eintrag: $($_.PSChildName)"
      Remove-Item -LiteralPath $_.PSPath -Recurse -Force
      $removedEntries++
    }
  }
}

Write-Host "`nFertig. Entfernte Windows-Einträge: $removedEntries" -ForegroundColor Green
Write-Host "Deine Einstellungen und der Bibel-Cache wurden nicht gelöscht."
Write-Host "Du kannst nun die portable Version starten oder den Installer erneut ausführen."
Read-Host "Zum Schließen Eingabetaste drücken"
