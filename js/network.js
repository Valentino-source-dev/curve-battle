// === WEBRTC PEERJS & SOLO AI HARNESS ===

class CurveNetwork {
  constructor(engine) {
    this.engine = engine;
    this.peer = null;
    this.conn = null;
    this.isHost = true;
    this.roomId = "";
    this.isConnected = false;
    this.isSoloAI = false;

    this.aiTimer = 0;

    this.initDOM();
    this.setupRoom();
  }

  initDOM() {
    this.connDot = document.getElementById('connDot');
    this.connStatus = document.getElementById('connStatus');
    this.roomBadge = document.getElementById('roomBadge');
    this.btnShareWA = document.getElementById('btnShareWA');
    this.btnCopyLink = document.getElementById('btnCopyLink');
    this.scoreP1 = document.getElementById('scoreP1');
    this.scoreP2 = document.getElementById('scoreP2');
    this.nameP1 = document.getElementById('nameP1');
    this.nameP2 = document.getElementById('nameP2');

    // Lobby DOM Elements
    this.lobbyOverlay = document.getElementById('lobbyOverlay');
    this.lobbyIcon = document.getElementById('lobbyIcon');
    this.lobbyTitle = document.getElementById('lobbyTitle');
    this.lobbySubtitle = document.getElementById('lobbySubtitle');
    this.lobbyShareActions = document.getElementById('lobbyShareActions');
    this.btnLobbyWA = document.getElementById('btnLobbyWA');
    this.btnLobbyCopy = document.getElementById('btnLobbyCopy');
    this.btnStartGame = document.getElementById('btnStartGame');
    this.lobbyBotOpt = document.getElementById('lobbyBotOpt');
    this.btnSoloBot = document.getElementById('btnSoloBot');

    // Attach round/match hooks to engine
    this.engine.onRoundEnd = (winner, scores) => {
      this.updateScoreboard(scores);
      if (this.isConnected && this.isHost) {
        this.send({ type: 'ROUND_SYNC', scores, winnerId: winner.id });
      }
    };

    this.engine.onMatchEnd = (winner) => {
      this.showMatchWinner(winner);
      if (this.isConnected && this.isHost) {
        this.send({ type: 'MATCH_END', winnerId: winner.id });
      }
    };

    // Hook Solo Bot AI Practice button
    if (this.btnSoloBot) {
      this.btnSoloBot.onclick = () => {
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
        this.connStatus.innerText = "🤖 PARTITA SINGOLA (VS BOT AI)";
        this.enableSoloAI();
        this.engine.startCountdown();
      };
    }
  }

  setupRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      this.isHost = false;
      this.roomId = roomParam.toUpperCase();
      this.nameP1.innerText = "TU (MAGENTA)";
      this.nameP1.style.color = "#ff0077";
      this.nameP2.innerText = "HOST (CYAN)";
      this.nameP2.style.color = "#00f0ff";
    } else {
      this.isHost = true;
      this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.nameP1.innerText = "TU (CYAN)";
      this.nameP1.style.color = "#00f0ff";
      this.nameP2.innerText = "SORELLA";
      this.nameP2.style.color = "#ff0077";
    }

    this.roomBadge.innerText = this.roomId;
    this.setupShareButtons();

    // Start PeerJS connection
    const myId = this.isHost
      ? `curve-${this.roomId}-host`
      : `curve-${this.roomId}-guest-${Date.now().toString().slice(-4)}`;

    this.peer = new Peer(myId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', () => {
      if (this.isHost) {
        this.connStatus.innerText = "IN ATTESA DI TUA SORELLA...";
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
        if (this.lobbyTitle) this.lobbyTitle.innerText = "IN ATTESA DI TUA SORELLA...";
        if (this.lobbySubtitle) this.lobbySubtitle.innerText = "Condividi il link o WhatsApp per sfidarla 1 vs 1";
        if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'flex';
        if (this.btnStartGame) this.btnStartGame.style.display = 'none';
        // Note: No automatic bot start or countdown! Game waits for 2nd player or explicit bot click.
      } else {
        this.connStatus.innerText = "CONNESSIONE ALL'HOST...";
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
        if (this.lobbyIcon) this.lobbyIcon.innerText = "📡";
        if (this.lobbyTitle) this.lobbyTitle.innerText = "CONNESSIONE ALL'HOST IN CORSO...";
        if (this.lobbySubtitle) this.lobbySubtitle.innerText = `Collegamento alla stanza ${this.roomId}...`;
        if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'none';
        if (this.btnStartGame) this.btnStartGame.style.display = 'none';
        if (this.lobbyBotOpt) this.lobbyBotOpt.style.display = 'none';
        this.connectToHost();
      }
    });

    this.peer.on('connection', (c) => {
      this.conn = c;
      this.setupDataChannel();
    });

    this.peer.on('error', (err) => {
      console.warn("P2P Signaling note:", err.type);
      if (!this.isConnected) {
        this.connStatus.innerText = "STANZA PRONTA (IN ATTESA DI CONNESSIONE)";
      }
    });
  }

  connectToHost() {
    const hostId = `curve-${this.roomId}-host`;
    this.conn = this.peer.connect(hostId, { reliable: false }); // Low-latency UDP
    this.setupDataChannel();
  }

  setupDataChannel() {
    this.conn.on('open', () => {
      this.isConnected = true;
      this.isSoloAI = false; // Disable AI when real player arrives
      this.connDot.classList.add('connected');
      this.connStatus.innerText = "🟢 ENTRAMBI COLLEGATI!";
      this.nameP2.innerText = this.isHost ? "SORELLA (MAGENTA)" : "HOST (CYAN)";
      this.engine.sound.playWin();

      if (this.isHost) {
        // Host sees the big AVVIA button to start when ready
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
        if (this.lobbyIcon) this.lobbyIcon.innerText = "⚡";
        if (this.lobbyTitle) this.lobbyTitle.innerText = "TUA SORELLA È CONNESSA!";
        if (this.lobbySubtitle) this.lobbySubtitle.innerText = "Entrambi i telefoni sono sincronizzati! Clicca per iniziare il duello:";
        if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'none';
        if (this.lobbyBotOpt) this.lobbyBotOpt.style.display = 'none';
        if (this.btnStartGame) {
          this.btnStartGame.style.display = 'block';
          this.btnStartGame.onclick = () => {
            this.btnStartGame.style.display = 'none';
            if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
            this.send({ type: 'START_MATCH' });
            this.engine.startCountdown();
          };
        }
      } else {
        // Guest waits for Host to launch
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
        if (this.lobbyIcon) this.lobbyIcon.innerText = "🎮";
        if (this.lobbyTitle) this.lobbyTitle.innerText = "CONNESSO ALL'HOST!";
        if (this.lobbySubtitle) this.lobbySubtitle.innerText = "In attesa che l'Host prema 'AVVIA IL DUELLO' per iniziare...";
        if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'none';
        if (this.btnStartGame) this.btnStartGame.style.display = 'none';
        if (this.lobbyBotOpt) this.lobbyBotOpt.style.display = 'none';
      }
    });

    this.conn.on('data', (data) => {
      this.handleMessage(data);
    });

    this.conn.on('close', () => {
      this.isConnected = false;
      this.connDot.classList.remove('connected');
      this.connStatus.innerText = "🔴 GIOCATORE DISCONNESSO";
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  handleMessage(data) {
    if (data.type === 'INPUT') {
      // Guest sends its steering input to Host
      if (this.isHost) {
        this.engine.inputP2 = data.steer;
      }
    } else if (data.type === 'START_MATCH') {
      if (!this.isHost) {
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
        this.engine.startCountdown();
      }
    } else if (data.type === 'START_ROUND') {
      if (!this.isHost) {
        this.engine.startCountdown();
      }
    } else if (data.type === 'ROUND_SYNC') {
      if (!this.isHost) {
        this.engine.scores = data.scores;
        this.updateScoreboard(data.scores);
      }
    } else if (data.type === 'MATCH_END') {
      if (!this.isHost) {
        const winner = this.engine.players.find(p => p.id === data.winnerId);
        this.showMatchWinner(winner);
      }
    } else if (data.type === 'RESTART_MATCH') {
      this.engine.scores = { p1: 0, p2: 0 };
      this.updateScoreboard(this.engine.scores);
      document.getElementById('matchWinnerModal').style.display = 'none';
      this.engine.startCountdown();
    } else if (data.type === 'RESTART_REQ') {
      if (this.isHost) {
        this.resetMatch();
      }
    }
  }

  sendLocalInput(steer) {
    if (this.isHost) {
      this.engine.localInputP1 = steer;
    } else {
      // Guest local input controls Player 2 in host's simulation
      this.send({ type: 'INPUT', steer: steer });
    }
  }

  setupShareButtons() {
    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;

    const handleCopy = (btn) => {
      navigator.clipboard.writeText(fullUrl);
      if (btn) {
        const orig = btn.innerText;
        btn.innerText = "✓ COPIATO!";
        setTimeout(() => btn.innerText = orig, 2000);
      }
    };

    if (this.btnCopyLink) this.btnCopyLink.onclick = () => handleCopy(this.btnCopyLink);
    if (this.btnLobbyCopy) this.btnLobbyCopy.onclick = () => handleCopy(this.btnLobbyCopy);

    const handleWA = () => {
      const waText = encodeURIComponent(`Sfida me a Curve Battle 1 vs 1 a scia laser! Clicca per entrare nell'arena: ${fullUrl}`);
      if (navigator.share) {
        navigator.share({
          title: 'Curve Battle 1v1',
          text: 'Sfida me a Curve Battle a scia laser sul browser!',
          url: fullUrl
        }).catch(() => {
          window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
        });
      } else {
        window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
      }
    };

    if (this.btnShareWA) this.btnShareWA.onclick = handleWA;
    if (this.btnLobbyWA) this.btnLobbyWA.onclick = handleWA;
  }

  enableSoloAI() {
    this.isSoloAI = true;
    this.nameP2.innerText = "NEON BOT (AI)";

    // Run AI update loop
    setInterval(() => {
      if (this.isSoloAI && this.engine.isRunning) {
        this.updateAI();
      }
    }, 45);
  }

  updateAI() {
    const bot = this.engine.players[1];
    if (!bot || !bot.alive) return;

    // Raycast ahead to avoid walls and trails
    const lookDist = 55;
    const checkAngles = [
      { steer: 0, ang: bot.angle },
      { steer: -1, ang: bot.angle - 0.7 },
      { steer: 1, ang: bot.angle + 0.7 }
    ];

    let bestSteer = 0;
    let maxClearance = -1;

    for (const ca of checkAngles) {
      const targetX = bot.x + Math.cos(ca.ang) * lookDist;
      const targetY = bot.y + Math.sin(ca.ang) * lookDist;

      // Clearance score: wall penalty
      let clearance = 100;
      if (targetX < 25 || targetX > this.engine.width - 25 || targetY < 25 || targetY > this.engine.height - 25) {
        clearance -= 80;
      }

      // Check trail collision distance
      for (const seg of this.engine.segments) {
        const d = this.engine.distToSegment({ x: targetX, y: targetY }, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 });
        if (d < 30) {
          clearance -= (30 - d) * 3;
        }
      }

      if (clearance > maxClearance) {
        maxClearance = clearance;
        bestSteer = ca.steer;
      }
    }

    this.engine.inputP2 = bestSteer;
  }

  updateScoreboard(scores) {
    if (this.scoreP1) this.scoreP1.innerText = scores.p1;
    if (this.scoreP2) this.scoreP2.innerText = scores.p2;
  }

  showMatchWinner(winner) {
    const modal = document.getElementById('matchWinnerModal');
    const title = document.getElementById('winnerTitle');
    const desc = document.getElementById('winnerDesc');

    const isMeWinner = (this.isHost && winner.id === 1) || (!this.isHost && winner.id === 2);

    title.innerText = isMeWinner ? "🏆 HAI VINTO LA BATTAGLIA! 🏆" : "☠️ SEI STATO ELIMINATO! ☠️";
    title.style.color = winner.color;
    desc.innerText = `${winner.name} ha raggiunto 5 vittorie!`;

    modal.style.display = 'flex';
  }

  resetMatch() {
    this.engine.scores = { p1: 0, p2: 0 };
    this.updateScoreboard(this.engine.scores);
    const modal = document.getElementById('matchWinnerModal');
    if (modal) modal.style.display = 'none';

    if (this.isHost) {
      if (this.isConnected) {
        this.send({ type: 'RESTART_MATCH' });
      }
      this.engine.startCountdown();
    } else {
      if (this.isConnected) {
        this.send({ type: 'RESTART_REQ' });
      } else {
        this.engine.startCountdown();
      }
    }
  }
}
