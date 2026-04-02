#ifndef BootstrapSourceDir
  #define BootstrapSourceDir "..\..\..\tmp\bootstrap-client\bootstrap-package"
#endif

#ifndef BootstrapVersion
  #define BootstrapVersion "bootstrap-1"
#endif

#ifndef InstallerOutputDir
  #define InstallerOutputDir "..\..\..\tmp\bootstrap-installer"
#endif

[Setup]
AppId={{D0E3CF9D-0F29-4FA0-88BE-8D2A621D9F91}
AppName=AI Data Platform Bootstrap
AppVersion={#BootstrapVersion}
AppPublisher=AI Data Platform
DefaultDirName={localappdata}\AIDataPlatform\bootstrap
DefaultGroupName=AI Data Platform
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir={#InstallerOutputDir}
OutputBaseFilename=AIDataPlatformBootstrapSetup
SetupLogging=yes
UninstallDisplayName=AI Data Platform Bootstrap

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#BootstrapSourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\AI Data Platform Bootstrap"; Filename: "{app}\launch-bootstrap-client.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\AI Data Platform Bootstrap"; Filename: "{app}\launch-bootstrap-client.cmd"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\launch-bootstrap-client.cmd"; Description: "Launch AI Data Platform Bootstrap"; Flags: nowait postinstall skipifsilent
