# Chrome Screen Capture Extension Rules

Please refer to the complete agent instruction and architecture specification in [AGENTS.md](./AGENTS.md).

## Core Principles
1. **Manifest V3 Strict Compliance**: No remote code execution, ephemeral service worker lifecycle handling.
2. **Offscreen Document for Media**: All DOM, Canvas processing (stitching, cropping, DPR scaling), and `MediaRecorder` video capture must reside in `src/offscreen/`.
3. **Shadow DOM Isolation**: All content script overlays and UI widgets must use `attachShadow({ mode: 'closed' })` to prevent CSS collisions.
4. **Local-Only Processing**: Zero external telemetry or remote uploads. All captures and recordings remain on the user's device.
