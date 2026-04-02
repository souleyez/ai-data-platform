# Immutable Bootstrap Installer Note

## Decision

The Windows installer should be treated as a stable bootstrap package, not as an updatable runtime artifact.

That means:

- The bootstrap package keeps the same product identity and can stay on customer machines for a long time.
- Runtime upgrades happen by downloading and applying release packages into `%LocalAppData%\\AIDataPlatform\\releases\\<version>`.
- The bootstrap layer remains responsible for:
  - prerequisite checks
  - OpenClaw installation and repair
  - phone bootstrap and control-plane verification
  - background update orchestration
  - starting and stopping the current runtime

## Operational Rule

There are now two distinct package types:

1. Bootstrap package
   - fixed launcher and management scripts
   - built as `ai-data-platform-bootstrap.zip`
   - no normal upgrade path

2. Runtime release package
   - versioned application payload
   - downloaded from the control plane
   - staged under `releases/<version>`
   - switched independently of the bootstrap package

## Consequences

- `install-client.ps1` should seed or refresh the local bootstrap files, but it should not pretend that a runtime version is already installed.
- Client status should show bootstrap version separately from runtime version.
- Release publishing should keep targeting runtime releases only.
- Future installer UX should emphasize that the launcher is stable while the runtime is the moving part.

## Packaging

The repo now has two build paths:

1. Runtime release package
   - built by `tools/windows-client/build-client-release.ps1`
   - versioned
   - published through the control plane

2. Bootstrap installer package
   - bootstrap payload built by `tools/windows-client/build-bootstrap-package.ps1`
   - Windows installer wrapper built by `tools/windows-client/build-bootstrap-installer.ps1`
   - Inno Setup script at `tools/windows-client/installer/ai-data-platform-bootstrap.iss`
   - stable installer file name: `AIDataPlatformBootstrapSetup.exe`

The installer identity should remain stable. New product versions should update only the runtime package unless the bootstrap logic itself must change.
