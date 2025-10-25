# Pacman (HTML5 Canvas)

A compact, single-file Pac-Man clone implemented in HTML5 Canvas and vanilla JavaScript.

This repository contains a playable Pac-Man-like game with smooth movement, basic ghost AI, a simple map, synthesized background music, and classic-style tunnel teleport behavior.

## Files
- `index.html` — the page and canvas element.
- `style.css` — minimal styles for the page.
- `script.js` — game logic (rendering, input, AI, audio). Most of the gameplay lives here.

## Quick start

Open `index.html` in a browser. For the best results (and to avoid cross-origin issues with some browsers), serve the folder with a small local server and then open `http://localhost:8000` (or the port your server uses).

Example (from this project folder):

```powershell
# Python 3 built-in server
python -m http.server 8000

# or using Node (if you have http-server installed)
npx http-server -p 8000
```

Then open http://localhost:8000 in your browser, press an arrow key to start (this also resumes audio), and play.

## Controls
- Arrow keys — move Pac-Man (Up, Down, Left, Right)
- Movement is tile-committed: direction changes occur when Pac-Man reaches the center of a tile.

## Gameplay features
- Tile-based map with pellets and power pellets.
- Smooth, velocity-based movement for Pac-Man and ghosts (no lerp jitter).
- Ghost AI using BFS pathfinding with a small reservation system to avoid collisions.
- Tunnel teleport behavior restricted to a single tunnel row (tile-commit teleport only at the two edge tiles).
- Ghosts are slightly slower than Pac-Man (configured at ~90% of Pac-Man speed) and scale with progress.
- Synthesized background music using the WebAudio API (starts after the first user gesture).
- Automatic respawn: Pac-Man respawns under the ghost house on life loss; ghosts respawn in the ghost house.

## Internals / Notable variables
- `MAP` in `script.js` — ASCII map layout (30 rows × 28 columns by default).
- `tileSize` — size in pixels of a single tile (default 20).
- `PORTAL_ROW` — the single row index where the left/right tunnel teleport is allowed (tile-commit only).
- Movement model: sprites decide their next tile at tile center; pixel position is then moved toward the center with a velocity (pixels/frame) for smooth motion.
- Ghost pathfinding: `findNextStep()` (BFS) + `neighbors()` which respects portal wrapping only on the configured `PORTAL_ROW`.

## Tuning & development
- To tweak the game feel, edit values in `script.js`:
  - `pac.speed` — Pac-Man's base speed (pixels/frame scale).
  - Ghost base speeds are defined per ghost and are updated each frame to `pac.speed * 0.9 * speedMultiplier`.
  - `MUSIC_TEMPO` — change background music tempo.
  - `PORTAL_ROW` — change the tunnel row if you want a different row to act as the tunnel.

## Known notes / TODOs
- Add a small death/pause animation for classic feel (optional).
- Expose per-ghost personalities/speeds for more authentic behaviour.
- Add mute/unmute and UI controls for audio.
- Add a debug overlay to visualize pathfinding and reserved tiles.

## Contributing
This is a small personal project — feel free to open issues or submit pull requests if you'd like to propose improvements. Keep changes tidy and add small, testable commits.

## License
Use however you like — include attribution if you reuse code or assets. (No external assets were included in this repo.)

Enjoy! If you'd like, I can add a short pause-and-respawn animation or a mute button next.
