# Face & neck anatomy atlas

From this directory, run:

```sh
python3 -m http.server
```

Open http://localhost:8000. No build or package installation is required. Three.js 0.170.0 and its addons load from jsDelivr; an internet connection and a WebGL-capable browser are required. Opening `index.html` through `file://` will not load the data reliably.

## Controls

- Drag to orbit; scroll or pinch to zoom. Tap a structure to highlight both sides and read its notes.
- Use layer checkboxes and opacity sliders to reveal deeper structures. Layers at 8% opacity or lower cannot be picked. Isolate ghosts other enabled structures at 8%.
- Search names, word prefixes, or approximate subsequences. A result selects the structure and moves the camera toward it. Content without geometry opens its notes without moving the camera.
- Camera buttons show the subject's left/right views. Reset restores the front camera, preserving layer settings and annotations.
- Quiz chooses among enabled, pickable layers with at least four distinct names, using three distractors from the same layer. Sparse layers cannot supply a four-choice question. Correct answers and total attempts persist in localStorage.
- Pin mode enables skin picking. Tap skin, enter a label, and save. The Pins dialog can focus or delete individual pins. Pins persist in localStorage for this browser and origin.
- Below 720px, Layers and Notes open bottom panels. Quiz opens a bottom sheet. The toolbar remains available.
- Add `?debug=1` to display landmark dots and labels.

## Data handoff

The viewer reads the schemas in `data/CONTRACT.md` directly. Replace JSON files and reload; no code generation is involved. Existing files were preserved when placeholder fixtures were created. The supplied 115-landmark file and injection file were already present during implementation. `paths.json` and `content.json` were missing at that point and received two synthetic tubes and three clearly labelled sample entries respectively. Another seat may replace these fixtures while this directory is being assembled.

Synthetic tubes are UI fixtures, not verified vessel or nerve courses. No treatment recommendations were authored for the placeholders. Real injection-zone metadata is displayed as supplied. `product: both` uses teal. Strings from data are inserted as text, never interpreted as HTML.

The model faces +Z, verified from the nose/mouth and tragus coordinates in the manifest. This follows the contract's final coordinate note rather than its contradictory opening −Z note. Bounding-box endpoints are unioned without assuming their order; several supplied Z endpoints are reversed. The camera target and fit derive from skin and bone bounds. GLTFLoader-sanitized node names are mapped back to manifest keys.

Arteries, veins, and nerves use Catmull–Rom tube geometry, converting radius from millimetres to metres. Bilateral meshes and paths share content IDs. Missing optional JSON produces a visible warning and leaves available anatomy usable. Missing model/manifest or WebGL failure produces a startup error.

## Attribution

Model: Z-Anatomy and BodyParts3D, © The Database Center for Life Science, Japan, and Z-Anatomy contributors. This head/neck extraction and glTF conversion is a derivative model under Creative Commons Attribution–ShareAlike 4.0 International. The About dialog includes source and license links. Three.js is MIT licensed. The model license does not establish the clinical accuracy of separate study overlays.

## Verification record · 2026-09-07

- `node --check app.js`: passed.
- Python HTML parser: checked unique IDs, required assets, import-map JSON and module entry.
- Input validation: all 362 GLB mesh names matched the manifest; 23 zone anchor sets resolved; JSON files parsed; 146 incoming paths passed coordinate/layer/radius checks. The parent seat replaced the sample path file during verification.
- Browser visual check attempted: Interceptor CLI is absent; native Chrome access was denied by the computer-use tool. No rendered desktop/mobile verification is claimed.

This app directory is a delegated scratch deliverable, not a Git checkout. The parent Claude conductor owns integration, cross-family review, and the durable vault project record. No deployment or merge was performed.
