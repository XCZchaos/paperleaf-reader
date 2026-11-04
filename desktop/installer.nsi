; A per-user installer. Uninstaller generation happens on the user's Windows
; machine, so building does not require executing Windows code under Wine.
; Compress the full payload once using solid LZMA.
SetCompress force
SetCompressor /SOLID lzma
SetCompressorDictSize 32
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Unicode true
Name "Paperleaf"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Paperleaf"
VIAddVersionKey "FileDescription" "Paperleaf Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Paperleaf"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Paperleaf"
InstallDirRegKey HKCU "Software\Paperleaf" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show
!define MUI_ICON "${PROJECT_DIR}/desktop/assets/paperleaf.ico"
!define MUI_UNICON "${PROJECT_DIR}/desktop/assets/paperleaf.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Paperleaf.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Paperleaf requires 64-bit Windows."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Paperleaf requires Windows 10 or later."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
FunctionEnd

Section "Paperleaf" SEC_MAIN
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_DIR}/work/desktop/release/Paperleaf-win32-x64/*.*"
  WriteUninstaller "$INSTDIR\Uninstall Paperleaf.exe"
  CreateShortcut "$DESKTOP\Paperleaf.lnk" "$INSTDIR\Paperleaf.exe" "" "$INSTDIR\paperleaf-${VERSION}.ico" 0
  CreateDirectory "$SMPROGRAMS\Paperleaf"
  CreateShortcut "$SMPROGRAMS\Paperleaf\Paperleaf.lnk" "$INSTDIR\Paperleaf.exe" "" "$INSTDIR\paperleaf-${VERSION}.ico" 0
  CreateShortcut "$SMPROGRAMS\Paperleaf\卸载 Paperleaf.lnk" "$INSTDIR\Uninstall Paperleaf.exe"
  WriteRegStr HKCU "Software\Paperleaf" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "DisplayName" "Paperleaf"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "Publisher" "Paperleaf"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "DisplayIcon" "$INSTDIR\paperleaf-${VERSION}.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "UninstallString" '"$INSTDIR\Uninstall Paperleaf.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf" "NoRepair" 1
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext current
  Delete "$DESKTOP\Paperleaf.lnk"
  Delete "$SMPROGRAMS\Paperleaf\Paperleaf.lnk"
  Delete "$SMPROGRAMS\Paperleaf\卸载 Paperleaf.lnk"
  RMDir "$SMPROGRAMS\Paperleaf"
  ; Remove only shipped files, preserving all cloud and per-user account data.
  !include "${PROJECT_DIR}/desktop/uninstall-files.nsh"
  Delete "$INSTDIR\Uninstall Paperleaf.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperleaf"
  DeleteRegKey HKCU "Software\Paperleaf"
SectionEnd
