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

  // No portal rows — teleportation disabled
  const portalRows = new Set();

  function tileToXY(r,c){ return {x: c*tileSize + tileSize/2, y: r*tileSize + tileSize/2}; }

  // find pacman start (we'll place near bottom center)
  const pac = {r:23, c:13, x:0, y:0, dir:{r:0,c:0}, nextDir:{r:0,c:0}, speed: 0.12 * tileSize, mouth:0, facingAngle:0};
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
  window.addEventListener('keydown', e=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); keys[e.key]=true; if(audioCtx.state==='suspended') audioCtx.resume(); });
  window.addEventListener('keyup', e=>{ keys[e.key]=false; });

  // initialize positions
  function initPositions(){
    const ppos = tileToXY(pac.r, pac.c); pac.x = ppos.x; pac.y = ppos.y; pac.dir = {r:0,c:0}; pac.nextDir = {r:0,c:0};
    pac.facingAngle = 0;
    ghosts.forEach((g,i)=>{ const pos = tileToXY(g.r, g.c); g.x = pos.x; g.y = pos.y; g.dir={r:0,c:0}; g.edible = false; g.state='scatter'; g.released = i===0; });
  }

  // pathfinding (BFS) on grid to get next step from (r,c) to target (tr,tc)
  function neighbors(r,c){
    const out=[]; const deltas=[[-1,0],[1,0],[0,-1],[0,1]];
    for(const d of deltas){
      const nr=r+d[0], nc=c+d[1];
      if(nr<0||nr>=rows) continue;
        if(nc < 0 || nc >= cols) continue; // do not wrap — portals disabled
        if(grid[nr][nc].type !== 'wall') out.push({r:nr,c:nc});
    }
    return out;
  }
  // helper to wrap a column index when on a portal row; returns null if move not allowed
  function wrapColIfPortal(r, c){
    // portals disabled: never wrap
    if(c < 0 || c >= cols) return null;
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
    if(c < 0 || c >= cols) return false; // no wrapping allowed
    return grid[r][c].type !== 'wall';
  }

  // game loop update
  let last = performance.now();
  let powerActive = false; let powerExpires = 0; let frightenedEnd = 0; let ghostModeTimer = 0; let ghostScatter = true;
  let gameRunning = true;
  function endGame(){
    gameRunning = false;
    setMessage('Game Over');
    // allow UI update then show popup
    setTimeout(()=>{ alert('Game Over\nScore: ' + score); }, 50);
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
      if(pac.nextDir && canMoveTo(pac.r + pac.nextDir.r, pac.c + pac.nextDir.c)) {
        pac.dir = {...pac.nextDir};
        // update facing angle to new direction
        pac.facingAngle = Math.atan2(-pac.dir.r, pac.dir.c);
      }
      // if current dir blocked, stop
      if(!canMoveTo(pac.r + pac.dir.r, pac.c + pac.dir.c)) pac.dir = {r:0,c:0};
      // step tile if moving
      if(pac.dir.r!==0 || pac.dir.c!==0){
        pac.r += pac.dir.r;
        pac.c += pac.dir.c;
        // do NOT snap here; rely on pixel-level wrap after interpolation so momentum stays smooth
      }
    }
  // move pixel position toward tile center (for smooth motion)
  const targetX = pac.c*tileSize + tileSize/2; const targetY = pac.r*tileSize + tileSize/2;
  const lerp = Math.min(1, pac.speed * dt / tileSize);
  const prevX = pac.x, prevY = pac.y;
  pac.x += (targetX - pac.x) * lerp;
  pac.y += (targetY - pac.y) * lerp;
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

  // update ghost speeds based on progress
  for(const g of ghosts){ g.speed = g.baseSpeed * speedMultiplier; }

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
            } else {
              planned.set(g, step); reserved.add(key); g.next = step;
            }
          } else {
            // no path (shouldn't happen often) - pick a neighbor that's not previous if possible
            let alt = nbs.filter(n=> !(n.r===g._prevR && n.c===g._prevC));
            if(alt.length===0) alt = nbs;
            const pick = alt.length ? alt[Math.floor(Math.random()*alt.length)] : {r:gr,c:gc};
            planned.set(g, pick); reserved.add(`${pick.r},${pick.c}`); g.next = pick;
          }
        }
      } else {
        // still moving toward existing g.next - reserve that tile to prevent others from picking it
        const k = `${g.next.r},${g.next.c}`; reserved.add(k); planned.set(g, g.next);
      }
    }

  // Phase 2: move ghosts toward their planned next tile (pixel smooth movement)
    for(const g of ghosts){
  const next = g.next || {r: Math.round(g.r), c: Math.round(g.c)};
  const pos = tileToXY(next.r, next.c);
  const prevGX = g.x, prevGY = g.y;
  // slightly reduce ghost speed inside tunnels for classic feel
  const inTunnelRow = portalRows.has(Math.round(g.r));
  const tunnelFactor = inTunnelRow ? 0.92 : 1.0;
  const effectiveSpeed = g.speed * tunnelFactor;
  g.x += (pos.x - g.x) * Math.min(1, effectiveSpeed * dt / tileSize);
  g.y += (pos.y - g.y) * Math.min(1, effectiveSpeed * dt / tileSize);
  const dist = Math.hypot(g.x - pos.x, g.y - pos.y);
  if(dist < 2){ g.r = next.r; g.c = next.c; g.x = pos.x; g.y = pos.y; g.next = null; }

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
  restartBtn.addEventListener('click', ()=>{ if(audioCtx.state==='suspended') audioCtx.resume(); restart(); });

  // start
  restart(); requestAnimationFrame(loop);

  // expose for debugging
  window.pacman = { restart };

})();
