// === CURVE BATTLE 2D ENGINE (60 FPS) ===

class SoundFX {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTurn(freq = 440) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.3, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playCrash() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // White noise buffer for explosion
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.42);
  }

  playCountdown(pitch = 500) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.13);
  }

  playWin() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + (idx * 0.08));

      gain.gain.setValueAtTime(0.2, now + (idx * 0.08));
      gain.gain.exponentialRampToValueAtTime(0.001, now + (idx * 0.08) + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + (idx * 0.08));
      osc.stop(now + (idx * 0.08) + 0.36);
    });
  }
}

class CurveGameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundFX();

    this.width = 800;
    this.height = 600;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Game Loop State
    this.isRunning = false;
    this.isCountingDown = false;
    this.countdownValue = 3;
    this.lastFrameTime = performance.now();
    this.animId = null;

    // Match Score (First to 5)
    this.targetWins = 5;
    this.scores = { p1: 0, p2: 0 };
    this.roundWinner = null;

    // Trail segments storage: { x1, y1, x2, y2, isGap, pId }
    this.segments = [];
    this.particles = [];

    // Local inputs for Player 1: -1 (left), 0 (straight), 1 (right)
    this.localInputP1 = 0;
    // Input for Player 2 (from network or AI)
    this.inputP2 = 0;

    // Network callback hook
    this.onRoundEnd = null;
    this.onMatchEnd = null;

    // Initialize players
    this.initPlayers();
  }

  resize() {
    const container = this.canvas.parentElement;
    const w = Math.min(container.clientWidth || 800, 900);
    const h = Math.min(window.innerHeight * 0.65, 580);
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
  }

  initPlayers() {
    this.players = [
      {
        id: 1,
        name: "CYAN",
        color: "#00f0ff",
        glow: "rgba(0, 240, 255, 0.7)",
        x: this.width * 0.25,
        y: this.height * 0.5,
        angle: 0, // Facing right
        speed: 165,
        turnSpeed: 3.6,
        radius: 3,
        alive: true,
        // Gap generation
        gapTimer: 0,
        gapInterval: Math.random() * 2.0 + 2.5,
        gapDuration: 0.25,
        isGapping: false,
        recentPoints: []
      },
      {
        id: 2,
        name: "MAGENTA",
        color: "#ff0077",
        glow: "rgba(255, 0, 119, 0.7)",
        x: this.width * 0.75,
        y: this.height * 0.5,
        angle: Math.PI, // Facing left
        speed: 165,
        turnSpeed: 3.6,
        radius: 3,
        alive: true,
        // Gap generation
        gapTimer: 0,
        gapInterval: Math.random() * 2.0 + 2.5,
        gapDuration: 0.25,
        isGapping: false,
        recentPoints: []
      }
    ];
  }

  startCountdown() {
    this.isCountingDown = true;
    this.isRunning = false;
    this.countdownValue = 3;
    this.segments = [];
    this.particles = [];
    this.initPlayers();

    const interval = setInterval(() => {
      if (this.countdownValue > 1) {
        this.sound.playCountdown(440);
        this.countdownValue--;
      } else if (this.countdownValue === 1) {
        this.sound.playCountdown(880);
        this.countdownValue = "VIA!";
      } else {
        clearInterval(interval);
        this.isCountingDown = false;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
      }
    }, 650);

    if (!this.animId) this.loop();
  }

  loop() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    if (this.isRunning) {
      this.update(dt);
    }

    this.render();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  update(dt) {
    // 1. Steer Players
    const p1 = this.players[0];
    const p2 = this.players[1];

    if (p1.alive) {
      p1.angle += this.localInputP1 * p1.turnSpeed * dt;
    }
    if (p2.alive) {
      p2.angle += this.inputP2 * p2.turnSpeed * dt;
    }

    // 2. Move Players & Check Gaps
    this.players.forEach(p => {
      if (!p.alive) return;

      const oldX = p.x;
      const oldY = p.y;

      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;

      // Handle Gaps
      p.gapTimer += dt;
      if (!p.isGapping && p.gapTimer >= p.gapInterval) {
        p.isGapping = true;
        p.gapTimer = 0;
      } else if (p.isGapping && p.gapTimer >= p.gapDuration) {
        p.isGapping = false;
        p.gapTimer = 0;
        p.gapInterval = Math.random() * 2.0 + 2.5;
      }

      // Add trail segment
      if (!p.isGapping) {
        const seg = { x1: oldX, y1: oldY, x2: p.x, y2: p.y, pId: p.id };
        this.segments.push(seg);
        p.recentPoints.push({ x: p.x, y: p.y });
        if (p.recentPoints.length > 25) {
          p.recentPoints.shift();
        }
      }
    });

    // 3. Collision Checks
    this.checkCollisions();

    // 4. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.alpha -= dt * 2.5;
      if (pt.alpha <= 0) this.particles.splice(i, 1);
    }
  }

  checkCollisions() {
    this.players.forEach(p => {
      if (!p.alive) return;

      // Wall collision
      if (p.x <= p.radius || p.x >= this.width - p.radius || p.y <= p.radius || p.y >= this.height - p.radius) {
        this.killPlayer(p);
        return;
      }

      // Trail collision (distance from point p.x, p.y to segments)
      // Exclude recent points of this player
      const minIndex = this.segments.length - 24;

      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i];
        // Skip player's very recent segments to avoid self-collision at head
        if (seg.pId === p.id && i >= minIndex) continue;

        const d = this.distToSegment({ x: p.x, y: p.y }, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 });
        if (d < p.radius + 1.8) {
          this.killPlayer(p);
          return;
        }
      }
    });
  }

  distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  killPlayer(deadPlayer) {
    deadPlayer.alive = false;
    this.sound.playCrash();
    this.createExplosion(deadPlayer.x, deadPlayer.y, deadPlayer.color);

    // Identify winner
    const winningPlayer = this.players.find(p => p.id !== deadPlayer.id);
    if (winningPlayer.id === 1) this.scores.p1++;
    else this.scores.p2++;

    this.roundWinner = winningPlayer;
    this.isRunning = false;

    if (this.onRoundEnd) {
      this.onRoundEnd(winningPlayer, this.scores);
    }

    // Check match end (First to 5)
    if (this.scores.p1 >= this.targetWins || this.scores.p2 >= this.targetWins) {
      const matchWinner = this.scores.p1 >= this.targetWins ? this.players[0] : this.players[1];
      this.sound.playWin();
      if (this.onMatchEnd) this.onMatchEnd(matchWinner);
    } else {
      // Auto start next round after 2 seconds
      setTimeout(() => {
        this.startCountdown();
      }, 1900);
    }
  }

  createExplosion(x, y, color) {
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 220 + 40;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: color,
        radius: Math.random() * 4 + 2,
        alpha: 1.0
      });
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Arena Grid
    this.ctx.fillStyle = "#07070e";
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.strokeStyle = "rgba(0, 240, 255, 0.05)";
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // 2. Arena Outer Neon Border
    this.ctx.strokeStyle = "rgba(255, 204, 0, 0.4)";
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(2, 2, this.width - 4, this.height - 4);

    // 3. Render Trail Segments
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = "round";

    for (const seg of this.segments) {
      const col = seg.pId === 1 ? "#00f0ff" : "#ff0077";
      this.ctx.strokeStyle = col;
      this.ctx.shadowColor = col;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.moveTo(seg.x1, seg.y1);
      this.ctx.lineTo(seg.x2, seg.y2);
      this.ctx.stroke();
    }
    this.ctx.shadowBlur = 0;

    // 4. Render Player Heads
    this.players.forEach(p => {
      if (!p.alive) return;
      this.ctx.fillStyle = "#ffffff";
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 15;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius + 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    });

    // 5. Render Particles
    for (const pt of this.particles) {
      this.ctx.fillStyle = pt.color;
      this.ctx.globalAlpha = pt.alpha;
      this.ctx.shadowColor = pt.color;
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;

    // 6. Countdown Overlay
    if (this.isCountingDown) {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      this.ctx.fillRect(0, 0, this.width, this.height);

      this.ctx.fillStyle = "#ffcc00";
      this.ctx.font = "900 72px 'Impact', sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.shadowColor = "#ffcc00";
      this.ctx.shadowBlur = 25;
      this.ctx.fillText(this.countdownValue, this.width / 2, this.height / 2 + 25);
      this.ctx.shadowBlur = 0;
    }
  }
}
