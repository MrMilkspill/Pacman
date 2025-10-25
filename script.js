// Full-featured tile-based Pac-Man (simplified classic behaviour)
(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const messageEl = document.getElementById('message');
  const restartBtn = document.getElementById('restart');

  // audio
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq, time=0.08, type='sine', gain=0.12){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + time); o.stop(audioCtx.currentTime + time + 0.02);
  }
  function chomp(){ beep(880,0.06,'square',0.06); }
  function powerup(){ beep(400,0.28,'sawtooth',0.14); }
  function ghostEat(){ beep(1200,0.12,'sine',0.18); }
  function dieSound(){ beep(120,0.6,'sine',0.22); }

  // background music controls (synthesized loop)
  let _musicHandle = null; let _musicIndex = 0; const MUSIC_TEMPO = 160; // bpm, fast-paced
  function startMusic(){
    if(_musicHandle) return;
    _musicIndex = 0;
    const beatMs = 60000 / MUSIC_TEMPO; // quarter note ms
    const melody = [659,740,880,740,659,523,587,659]; // simple arpeggio-ish
    _musicHandle = setInterval(()=>{
      const f = melody[_musicIndex % melody.length];
      // lead melody (short)
      beep(f, 0.12, 'sawtooth', 0.06);
      // bass on alternating beats
      if(_musicIndex % 2 === 0) beep(110, 0.14, 'square', 0.08);
      // light hi-hat tick
      if(_musicIndex % 1 === 0) beep(1400, 0.03, 'triangle', 0.02);
      _musicIndex++;
    }, beatMs/2); // play at eighth-note resolution
  }
  function stopMusic(){ if(_musicHandle){ clearInterval(_musicHandle); _musicHandle = null; _musicIndex = 0; } }

  // tile map (simple classic-ish layout). Legend:
  // # wall, . pellet, o power pellet,  space empty, P pac start, G ghost house
  const MAP = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "     #.##### ## #####.#     ",
    "     #.##          ##.#     ",
    "     #.## ###GG### ##.#     ",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "     #.## ######## ##.#     ",
    "     #.##          ##.#     ",
    "     #.## ######## ##.#     ",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##................##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################"
  ];

  const tileSize = 20;
  const rows = MAP.length; const cols = MAP[0].length;
  canvas.width = cols * tileSize; canvas.height = rows * tileSize;

  // game state
  let score = 0, lives = 3, level = 1;
  let pelletsTotal = 0;

  // grid derived from MAP
   let pelletsStart; // Declare pelletsStart variable
  const grid = []; // {type:'wall'|'pellet'|'power'|'empty'|'ghostHouse'}
  for(let r=0;r<rows;r++){
    grid[r] = [];
    for(let c=0;c<cols;c++){
      const ch = MAP[r][c] || ' ';
      if(ch === '#') grid[r][c] = {type:'wall'};
      else if(ch === '.') { grid[r][c] = {type:'pellet'}; pelletsTotal++; }
      else if(ch === 'o') { grid[r][c] = {type:'power'}; pelletsTotal++; }
      else if(ch === 'G') grid[r][c] = {type:'ghostHouse'};
      else if(ch === 'P') grid[r][c] = {type:'empty'};
      else grid[r][c] = {type:'empty'};
    }
  }

  // Portal configuration: single tunnel row where Pac-Man may teleport at the two edge tiles
  const PORTAL_ROW = 14; // only this row has edge teleport behaviour for Pac-Man
  const portalRows = new Set();

  function tileToXY(r,c){ return {x: c*tileSize + tileSize/2, y: r*tileSize + tileSize/2}; }

  // find pacman start (we'll place near bottom center)
  const PAC_START = {r:23, c:13};
  const pac = {r:PAC_START.r, c:PAC_START.c, x:0, y:0, dir:{r:0,c:0}, nextDir:{r:0,c:0}, speed: 0.12 * tileSize, mouth:0, facingAngle:0};
  const ghostHouse = {r:12,c:13};

  // ghosts
  const ghostColors = ['#ff4d4d','#4da6ff','#b366ff','#ffb84d'];
  const ghosts = [];
  for(let i=0;i<4;i++){
    const base = 0.11 * tileSize;
    ghosts.push({r:ghostHouse.r, c:ghostHouse.c + (i-1.5), x:0,y:0, dir:{r:0,c:0}, state:'scatter', edible:false, color:ghostColors[i], baseSpeed: base, speed: base, home:{r:ghostHouse.r, c:ghostHouse.c + (i-1.5)}, released:false});
  }

  // helpers
  function setMessage(t){ messageEl.textContent = t || ''; }
  function updateUI(){ scoreEl.textContent = 'Score: '+score; livesEl.textContent = 'Lives: '+lives; levelEl.textContent = 'Level: '+level; }

  // input
  const keys = {};
  window.addEventListener('keydown', e=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); keys[e.key]=true; if(audioCtx.state==='suspended') audioCtx.resume().then(()=>{ startMusic(); }); });
  window.addEventListener('keyup', e=>{ keys[e.key]=false; });

  // hide the restart button — game will restart automatically
  if(restartBtn) restartBtn.style.display = 'none';

  // initialize positions
  function initPositions(){
    // reset Pac-Man to his start tile under the ghost house
    pac.r = PAC_START.r; pac.c = PAC_START.c;
    const ppos = tileToXY(pac.r, pac.c); pac.x = ppos.x; pac.y = ppos.y; pac.dir = {r:0,c:0}; pac.nextDir = {r:0,c:0};
    pac.facingAngle = 0;
      // reset ghosts to their house positions (center of the little box)
      // also clear transient movement state so they don't immediately trigger wrap/teleport logic
      ghosts.forEach((g,i)=>{
        g.r = g.home.r; g.c = g.home.c;
        const pos = tileToXY(g.r, g.c); g.x = pos.x; g.y = pos.y;
        g.dir = {r:0,c:0}; g.next = null; g._prevR = Math.round(g.r); g._prevC = Math.round(g.c);
        g.edible = false; g.state = 'scatter'; g.released = i===0;
        g.justRespawned = true; // skip portal-instant teleport for one planning tick
      });
  }

  // pathfinding (BFS) on grid to get next step from (r,c) to target (tr,tc)
  function neighbors(r,c){
    const out=[]; const deltas=[[-1,0],[1,0],[0,-1],[0,1]];
    for(const d of deltas){
      const nr=r+d[0], nc=c+d[1];
      if(nr<0||nr>=rows) continue;
      // allow wrapping across the portal row only
      const wc = wrapColIfPortal(nr, nc);
      if(wc === null) continue;
      if(grid[nr][wc].type !== 'wall') out.push({r:nr,c:wc});
    }
    return out;
  }
  // helper to wrap a column index when on a portal row; returns null if move not allowed
  function wrapColIfPortal(r, c){
    // Only allow wrapping on the configured PORTAL_ROW
    if(c < 0 || c >= cols){
      if(r === PORTAL_ROW) return (c + cols) % cols;
      return null;
    }
    return c;
  }
  function findNextStep(sr,sc,tr,tc){
    if(sr===tr && sc===tc) return null;
    const q = []; const seen = new Array(rows).fill(null).map(()=>new Array(cols).fill(false));
    const prev = new Array(rows).fill(null).map(()=>new Array(cols).fill(null));
    q.push({r:sr,c:sc}); seen[sr][sc]=true;
    while(q.length){ const cur=q.shift(); if(cur.r===tr && cur.c===tc) break; for(const n of neighbors(cur.r,cur.c)){ if(!seen[n.r][n.c]){ seen[n.r][n.c]=true; prev[n.r][n.c]=cur; q.push(n); } } }
    if(!seen[tr][tc]) return null; // no path
    // walk back
    let cur = {r:tr,c:tc}; let back = null; while(prev[cur.r][cur.c]){ back = cur; cur = prev[cur.r][cur.c]; }
    // back is the first step from start
    return back;
  }

  // movement utilities
  function canMoveTo(r,c){ if(r<0||c<0||r>=rows||c>=cols) return false; return grid[r][c].type !== 'wall'; }
  // allow moving through portals: if column is out-of-bounds but the row is a portal row,
  // wrap the column and test the wrapped tile instead
  function canMoveTo(r,c){
    if(r < 0 || r >= rows) return false;
    if(c < 0 || c >= cols){
      const wc = wrapColIfPortal(r, c);
      if(wc === null) return false;
      c = wc;
    }
    return grid[r][c].type !== 'wall';
  }

  // game loop update
  let last = performance.now();
  let powerActive = false; let powerExpires = 0; let frightenedEnd = 0; let ghostModeTimer = 0; let ghostScatter = true;
  let gameRunning = true;
  function endGame(){
    gameRunning = false;
    setMessage('Game Over');
    // stop music and auto-restart after a short delay
    stopMusic();
    setTimeout(()=>{ restart(); startMusic(); }, 1200);
  }

  function handleInput(){
    if(keys['ArrowUp']) pac.nextDir = {r:-1,c:0};
    else if(keys['ArrowDown']) pac.nextDir = {r:1,c:0};
    else if(keys['ArrowLeft']) pac.nextDir = {r:0,c:-1};
    else if(keys['ArrowRight']) pac.nextDir = {r:0,c:1};
  }

  function update(){
    const now = performance.now(); const dt = (now - last)/16.666; last = now; // ~60fps scaling
    if(isNaN(dt) || dt>5) return; // guard

    handleInput();

    // compute progress: fraction of pellets eaten (0..1)
    const progress = pelletsStart > 0 ? (1 - (pelletsTotal / pelletsStart)) : 0;
      // scale ghost speed and aggression with progress
      // 'lookahead' variable computed above in update scope
    const speedMultiplier = 1 + progress * 0.9; // up to ~1.9x speed
    const lookahead = Math.max(1, Math.ceil(1 + progress * 4)); // how many tiles ahead ghosts anticipate
    const scatterBase = 7000; const minScatter = 2000; const scatterTime = Math.max(minScatter, scatterBase * (1 - progress * 0.6));

    // Pacman movement — move smoothly toward next tile if allowed
    // If pac is near center of his tile, allow turning
    const centerX = pac.c*tileSize + tileSize/2; const centerY = pac.r*tileSize + tileSize/2;
    const dx = pac.x - centerX; const dy = pac.y - centerY;
    const distCenter = Math.hypot(dx,dy);
    // if close to center, snap and allow new direction
    if(distCenter < 2){ pac.x = centerX; pac.y = centerY;
      // if nextDir available and free, adopt it
      if(pac.nextDir){
        const ndR = pac.r + pac.nextDir.r;
        const ndC = pac.c + pac.nextDir.c;
        let allowNext = canMoveTo(ndR, ndC);
        // Special-case: allow Pac-Man to attempt stepping off the left/right edge from the designated portal edge tile
        if(!allowNext && pac.nextDir.r === 0 && Math.abs(pac.nextDir.c) === 1 && pac.r === PORTAL_ROW && (ndC < 0 || ndC >= cols)){
          allowNext = true;
        }
        if(allowNext){
          pac.dir = {...pac.nextDir};
          // update facing angle to new direction
          pac.facingAngle = Math.atan2(-pac.dir.r, pac.dir.c);
        }
      }
      // if current dir blocked, stop (but allow portal-edge stepping for Pac-Man)
      const checkR = pac.r + pac.dir.r; const checkC = pac.c + pac.dir.c;
      let dirBlocked = !canMoveTo(checkR, checkC);
      if(dirBlocked && pac.dir.r === 0 && Math.abs(pac.dir.c) === 1 && pac.r === PORTAL_ROW && (checkC < 0 || checkC >= cols)){
        dirBlocked = false; // allow tile-commit to perform portal teleport
      }
      if(dirBlocked) pac.dir = {r:0,c:0};
      // step tile if moving
      if(pac.dir.r!==0 || pac.dir.c!==0){
        // compute intended next tile
        const nextR = pac.r + pac.dir.r; const nextC = pac.c + pac.dir.c;
        // Tile-commit teleport: only when Pac-Man is centered on PORTAL_ROW, moving horizontally from an edge tile
        if(pac.dir.r === 0 && pac.r === PORTAL_ROW && (nextC < 0 || nextC >= cols)){
          // teleport to opposite edge tile, but only if destination tile is passable
          const destC = (nextC + cols) % cols;
          if(grid[pac.r][destC] && grid[pac.r][destC].type !== 'wall'){
            pac.c = destC;
            // snap pixel position to center of destination tile to avoid jitter
            const ppos = tileToXY(pac.r, pac.c); pac.x = ppos.x; pac.y = ppos.y;
            // keep pac.dir (direction) unchanged so motion continues
          } else {
            // destination blocked; do not move (treat as wall)
          }
        } else {
          // normal tile step (within bounds)
          pac.r = nextR; pac.c = nextC;
        }
        // do NOT snap here beyond above; rely on pixel interpolation for smoothness when not teleporting
      }
    }
  // move pixel position toward tile center (velocity-based for smooth constant speed)
  const targetX = pac.c*tileSize + tileSize/2; const targetY = pac.r*tileSize + tileSize/2;
  const prevX = pac.x, prevY = pac.y;
  const dxp = targetX - pac.x, dyp = targetY - pac.y;
  const distp = Math.hypot(dxp, dyp);
  const moveP = pac.speed * dt; // pixels to move this frame
  if(distp <= moveP + 0.001){
    pac.x = targetX; pac.y = targetY;
  } else if(distp > 0.001){
    pac.x += (dxp / distp) * moveP;
    pac.y += (dyp / distp) * moveP;
  }
  pac.mouth += 0.2*dt;
  // set facing angle from instantaneous pixel velocity so mouth always points in movement direction
  const vx = pac.x - prevX, vy = pac.y - prevY;
  if(Math.abs(vx) + Math.abs(vy) > 0.001){ pac.facingAngle = Math.atan2(vy, vx); }

    // collect pellets at pac's tile
    const cell = grid[pac.r][pac.c];
    if(cell.type === 'pellet'){ cell.type='empty'; score += 10; pelletsTotal--; chomp(); updateUI(); }
    if(cell.type === 'power'){ cell.type='empty'; score += 50; pelletsTotal--; powerActive = true; powerExpires = now + 8000; frightenedEnd = now + 8000; ghosts.forEach(g=>g.edible=true); powerup(); updateUI(); }

    // No tunnel teleportation: clamp Pac-Man to the visible play area
    pac.x = Math.max(pac.x, tileSize/2); pac.x = Math.min(pac.x, canvas.width - tileSize/2);
    pac.c = Math.max(0, Math.min(cols-1, pac.c));

  // ghost mode toggling (scatter/chase cycle scales with progress)
  ghostModeTimer += (now - (window._gmLast||now)); window._gmLast = now;
  if(ghostModeTimer > scatterTime){ ghostScatter = !ghostScatter; ghostModeTimer = 0; }

  if(powerActive && now > powerExpires){ powerActive = false; ghosts.forEach(g=>g.edible=false); }

  // update ghost speeds based on progress — make ghosts 90% of Pac-Man speed
  for(const g of ghosts){ g.speed = pac.speed * 0.9 * speedMultiplier; }

    // Ghost movement: tile-centered selection with reservation to avoid two non-edible ghosts choosing same next tile.
    // Phase 1: prepare previous tiles and a reservation set
    for(const g of ghosts){ g._prevR = Math.round(g.r); g._prevC = Math.round(g.c); }
    const reserved = new Set();
    const planned = new Map();

    // Determine desired next tile for each ghost (but don't move yet)
    for(const g of ghosts){
      const gr = Math.round(g.r), gc = Math.round(g.c);
      // find center distance to know if currently between tiles
      const centerPos = tileToXY(gr,gc); const dcenter = Math.hypot(g.x - centerPos.x, g.y - centerPos.y);
      // only pick a new next tile when at or very near center
      if(!g.next || dcenter < 2){
        // compute neighbors available
        const nbs = neighbors(gr,gc);
        // frightened: random move (allow passing through other ghosts)
        if(g.edible){
          const choices = nbs.length ? nbs : [{r:gr,c:gc}];
          const pick = choices[Math.floor(Math.random()*choices.length)];
          planned.set(g, pick); // do not reserve so others may overlap
          g.next = pick;
        } else {
          // choose target depending on scatter/chase
            let target;
            if(ghostScatter){
              target = [{r:0,c:0},{r:0,c:cols-1},{r:rows-1,c:0},{r:rows-1,c:cols-1}][ghosts.indexOf(g) % 4];
            } else {
              // chase: anticipate Pac-Man movement using lookahead (scales with progress)
              const aheadR = pac.r + (pac.dir.r || 0) * lookahead;
              const aheadC = pac.c + (pac.dir.c || 0) * lookahead;
              const tr = Math.max(0, Math.min(rows-1, aheadR));
              const tc = Math.max(0, Math.min(cols-1, aheadC));
              target = (grid[tr][tc] && grid[tr][tc].type !== 'wall') ? {r:tr, c:tc} : {r:pac.r, c:pac.c};
            }
          // try best path
          let step = findNextStep(gr, gc, target.r, target.c);
          // if no path or step reserved, try alternative neighbors sorted by closeness to target
          if(step){
            // if reserved by another planned ghost, try alternatives
            const key = `${step.r},${step.c}`;
            if(reserved.has(key)){
              // try alternatives
              const alt = nbs.slice().sort((a,b)=> Math.hypot(a.r-target.r,a.c-target.c) - Math.hypot(b.r-target.r,b.c-target.c));
              let chosen = null;
              for(const a of alt){ const k = `${a.r},${a.c}`; if(!reserved.has(k) && !(a.r===g._prevR && a.c===g._prevC)){ chosen=a; break; } }
              if(!chosen) chosen = step; // give up and take original
              planned.set(g, chosen); reserved.add(`${chosen.r},${chosen.c}`); g.next = chosen;
              // If this move is a portal-edge teleport (on PORTAL_ROW moving off left/right), perform instant teleport
              if(!g.justRespawned && gr === PORTAL_ROW && ((g._prevC === 0 && chosen.c === cols-1) || (g._prevC === cols-1 && chosen.c === 0))){
                // teleport ghost instantly to destination edge tile
                g.r = gr; g.c = chosen.c; const p = tileToXY(g.r,g.c); g.x = p.x; g.y = p.y; g.next = null;
              }
            } else {
              planned.set(g, step); reserved.add(key); g.next = step;
              if(!g.justRespawned && gr === PORTAL_ROW && ((g._prevC === 0 && step.c === cols-1) || (g._prevC === cols-1 && step.c === 0))){
                g.r = gr; g.c = step.c; const p = tileToXY(g.r,g.c); g.x = p.x; g.y = p.y; g.next = null;
              }
            }
          } else {
            // no path (shouldn't happen often) - pick a neighbor that's not previous if possible
            let alt = nbs.filter(n=> !(n.r===g._prevR && n.c===g._prevC));
            if(alt.length===0) alt = nbs;
            const pick = alt.length ? alt[Math.floor(Math.random()*alt.length)] : {r:gr,c:gc};
            planned.set(g, pick); reserved.add(`${pick.r},${pick.c}`); g.next = pick;
            if(!g.justRespawned && gr === PORTAL_ROW && ((g._prevC === 0 && pick.c === cols-1) || (g._prevC === cols-1 && pick.c === 0))){
              g.r = gr; g.c = pick.c; const p = tileToXY(g.r,g.c); g.x = p.x; g.y = p.y; g.next = null;
            }
          }
        }
      } else {
        // still moving toward existing g.next - reserve that tile to prevent others from picking it
        const k = `${g.next.r},${g.next.c}`; reserved.add(k); planned.set(g, g.next);
      }
      // clear the justRespawned flag after we've done the one protected planning step
      if(g.justRespawned) g.justRespawned = false;
    }

  // Phase 2: move ghosts toward their planned next tile (pixel smooth movement)
    for(const g of ghosts){
  const next = g.next || {r: Math.round(g.r), c: Math.round(g.c)};
  const pos = tileToXY(next.r, next.c);
  const prevGX = g.x, prevGY = g.y;
  // slightly reduce ghost speed inside tunnels for classic feel
  const inTunnelRow = (Math.round(g.r) === PORTAL_ROW);
  const tunnelFactor = inTunnelRow ? 0.92 : 1.0;
  const effectiveSpeed = g.speed * tunnelFactor;
  // Velocity-based movement: compute vector toward target and move by up to effectiveSpeed * dt pixels
  const dxg = pos.x - g.x, dyg = pos.y - g.y;
  const distToPos = Math.hypot(dxg, dyg);
  const movePixels = effectiveSpeed * dt; // dt ~1 per frame
  if(distToPos <= movePixels + 0.001){
    // close enough: snap to center and complete tile commit
    g.x = pos.x; g.y = pos.y; g.r = next.r; g.c = next.c; g.next = null;
  } else if(distToPos > 0.001) {
    g.x += (dxg / distToPos) * movePixels;
    g.y += (dyg / distToPos) * movePixels;
  }

      // No tunnel teleportation for ghosts: clamp to canvas edges
      g.x = Math.max(g.x, tileSize/2); g.x = Math.min(g.x, canvas.width - tileSize/2);
      g.c = Math.max(0, Math.min(cols-1, g.c));

      // collision with pacman (pixel distance)
      const pd = Math.hypot(g.x - pac.x, g.y - pac.y);
      if(pd < tileSize*0.6){
        if(g.edible){ score += 200; ghostEat(); // return to ghosthouse
          g.r = ghostHouse.r; g.c = ghostHouse.c; const pos2 = tileToXY(g.r,g.c); g.x = pos2.x; g.y = pos2.y; g.edible=false; updateUI();
        } else {
          // pac dies
          dieSound(); lives--; updateUI(); setMessage('You died');
          if(lives<=0){ setMessage('Game Over - press Restart'); endGame(); }
          else { initPositions(); }
        }
      }
    }

    // win check
    if(pelletsTotal <= 0){ setMessage('Level Complete! Press Restart to play again'); }
  }

  // drawing
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw map
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const cell = grid[r][c]; const x = c*tileSize, y=r*tileSize;
        if(cell.type === 'wall'){
          ctx.fillStyle = '#001f5a'; ctx.fillRect(x,y,tileSize,tileSize);
        } else {
          ctx.fillStyle = '#000'; ctx.fillRect(x,y,tileSize,tileSize);
        }
        if(cell.type === 'pellet'){
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x+tileSize/2,y+tileSize/2, tileSize*0.12,0,Math.PI*2); ctx.fill();
        }
        if(cell.type === 'power'){
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x+tileSize/2,y+tileSize/2, tileSize*0.3,0,Math.PI*2); ctx.fill();
        }
      }
    }

    // draw ghosts
    for(const g of ghosts){
      ctx.fillStyle = g.edible ? '#2b5faa' : g.color;
      ctx.beginPath(); ctx.arc(g.x, g.y - tileSize*0.12, tileSize*0.36, Math.PI, 0); ctx.fill();
      ctx.fillRect(g.x - tileSize*0.36, g.y - tileSize*0.12, tileSize*0.72, tileSize*0.36);
      // eyes
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.x - tileSize*0.12, g.y - tileSize*0.2, tileSize*0.09,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(g.x + tileSize*0.12, g.y - tileSize*0.2, tileSize*0.09,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(g.x - tileSize*0.12, g.y - tileSize*0.2, tileSize*0.04,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(g.x + tileSize*0.12, g.y - tileSize*0.2, tileSize*0.04,0,Math.PI*2); ctx.fill();
    }

    // draw pacman - mouth faces current facingAngle
    const angle = (typeof pac.facingAngle === 'number') ? pac.facingAngle : 0;
    const mouth = 0.25 + 0.15 * Math.sin(pac.mouth);
    ctx.fillStyle = '#FFD500'; ctx.beginPath(); ctx.moveTo(pac.x,pac.y);
    ctx.arc(pac.x,pac.y, tileSize*0.36, angle + mouth, angle - mouth); ctx.closePath(); ctx.fill();
  }

  // loop
  function loop(){
    if(gameRunning){ update(); draw(); requestAnimationFrame(loop); }
    else { draw(); }
  }

  // restart handler
  function restart(){ // rebuild pellets
    // rebuild grid pellets from MAP
    pelletsTotal = 0;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const ch = MAP[r][c] || ' '; if(ch === '.') { grid[r][c].type='pellet'; pelletsTotal++; } else if(ch==='o'){ grid[r][c].type='power'; pelletsTotal++; } else if(ch==='#'){ grid[r][c].type='wall'; } else grid[r][c].type='empty'; }
    // record starting pellet count for difficulty scaling
    pelletsStart = pelletsTotal;
    score = 0; lives = 3; level = 1; setMessage(''); updateUI(); initPositions();
    gameRunning = true;
    // start loop if not already running
    requestAnimationFrame(loop);
  }

  // wire restart button
  restartBtn.addEventListener('click', ()=>{
    if(audioCtx.state==='suspended'){
      audioCtx.resume().then(()=>{ restart(); startMusic(); });
    } else { restart(); startMusic(); }
  });

  // start
  restart(); requestAnimationFrame(loop);

  // expose for debugging
  window.pacman = { restart };

})();
