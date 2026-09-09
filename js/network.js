// === WEBRTC PEERJS & MULTIPLAYER HARNESS ===

class CurveNetwork {
  constructor(engine) {
    this.engine = engine;
    this.peer = null;
    this.conn = null;
    this.isHost = true;
    this.roomId = "";
    this.isConnected = false;
    this.isSoloAI = false;
    this.retryTimer = null;
    this.connectAttempts = 0;

    this.initDOM();
    this.setupRoom();
    this.setupVisibilityListener();
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
    this.btnSoloBot = document.getElementById('btnSoloBot');
    this.lobbyRoomBadge = document.getElementById('lobbyRoomBadge');
    this.lobbyNetState = document.getElementById('lobbyNetState');

    // Live Player HUD elements in Lobby
    this.lobbyNameP1 = document.getElementById('lobbyNameP1');
    this.lobbyBadgeP1 = document.getElementById('lobbyBadgeP1');
    this.lobbyNameP2 = document.getElementById('lobbyNameP2');
    this.lobbyBadgeP2 = document.getElementById('lobbyBadgeP2');

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
        if (this.connStatus) this.connStatus.innerText = "VS BOT";
        this.enableSoloAI();
        this.engine.allowStart();
        this.engine.startCountdown();
      };
    }
  }

  setupRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (!roomParam) {
      // Creator of the room -> definitely Host
      this.isHost = true;
      this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        sessionStorage.setItem('cb_role_' + this.roomId, 'host');
      } catch(e) {}
      window.history.replaceState({}, '', `?room=${this.roomId}`);
    } else {
      this.roomId = roomParam.toUpperCase();
      const savedRole = sessionStorage.getItem('cb_role_' + this.roomId);
      this.isHost = (savedRole === 'host');
    }

    if (this.isHost) {
      if (this.nameP1) this.nameP1.innerText = "TU";
      if (this.nameP2) this.nameP2.innerText = "SORELLA";
      if (this.lobbyNameP1) this.lobbyNameP1.innerText = "TU (CYAN)";
      if (this.lobbyNameP2) this.lobbyNameP2.innerText = "SORELLA (MAGENTA)";
    } else {
      if (this.nameP1) this.nameP1.innerText = "TU";
      if (this.nameP2) this.nameP2.innerText = "HOST";
      if (this.lobbyNameP1) this.lobbyNameP1.innerText = "HOST (CYAN)";
      if (this.lobbyNameP2) this.lobbyNameP2.innerText = "TU (MAGENTA)";
    }

    if (this.roomBadge) this.roomBadge.innerText = this.roomId;
    if (this.lobbyRoomBadge) this.lobbyRoomBadge.innerText = this.roomId;
    this.setupShareButtons();
    this.initPeer();
  }

  initPeer() {
    const myId = this.isHost
      ? `curve-${this.roomId}-host`
      : `curve-${this.roomId}-guest-${Math.random().toString(36).substring(2, 6)}`;

    this.peer = new Peer(myId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log(`[P2P] Peer registered as: ${id}`);
      if (this.lobbyNetState) this.lobbyNetState.innerText = "SEGNALAZIONE ONLINE";

      if (this.isHost) {
        if (this.connStatus) this.connStatus.innerText = "ATTESA";
        this.updateLobbyWaitingState();
      } else {
        if (this.connStatus) this.connStatus.innerText = "CONNESSIONE...";
        this.connectToHost();
      }
    });

    this.peer.on('connection', (c) => {
      console.log("[P2P] Incoming connection received on Host!");
      this.conn = c;
      this.setupDataChannel();
    });

    this.peer.on('error', (err) => {
      console.warn("[P2P] Peer error:", err.type, err);
      if (err.type === 'peer-unavailable') {
        if (!this.isConnected && !this.isHost) {
          if (this.lobbySubtitle) {
            this.lobbySubtitle.innerText = `In attesa che l'Host sia online... (riprovo in automatico)`;
          }
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => {
            if (!this.isConnected && !this.isHost) {
              this.connectToHost();
            }
          }, 2200);
        }
      } else if (err.type === 'unavailable-id') {
        console.warn("[P2P] ID conflict, retrying after broker cleanup...");
        setTimeout(() => this.initPeer(), 1500);
      }
    });
  }

  connectToHost() {
    if (this.isConnected || this.isHost) return;
    const hostId = `curve-${this.roomId}-host`;
    this.connectAttempts++;
    console.log(`[P2P] Connecting to Host (${hostId}), attempt ${this.connectAttempts}...`);

    if (this.lobbyBadgeP2) {
      this.lobbyBadgeP2.innerText = `COLLEGAMENTO (${this.connectAttempts})...`;
      this.lobbyBadgeP2.className = "lobby-player-badge badge-waiting";
    }

    try {
      if (this.conn) {
        try { this.conn.close(); } catch(e){}
      }
      this.conn = this.peer.connect(hostId, { reliable: true });
      this.setupDataChannel();
    } catch(err) {
      console.warn("[P2P] connectToHost failed:", err);
    }

    // Schedule retry if not open within 3 seconds
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (!this.isConnected && !this.isHost) {
        this.connectToHost();
      }
    }, 3000);
  }

  setupDataChannel() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log("[P2P] DataChannel OPEN and synchronized!");
      this.isConnected = true;
      this.isSoloAI = false;
      if (this.retryTimer) clearTimeout(this.retryTimer);

      if (this.connDot) this.connDot.classList.add('connected');
      if (this.connStatus) this.connStatus.innerText = "1v1 ONLINE";

      // Vibrate & Sound feedback
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 60, 100]); } catch(e){}
      }
      this.engine.sound.playWin();

      // Send handshake ping
      this.send({ type: 'HANDSHAKE', isHost: this.isHost });

      // Show Connected State on both phones
      this.showConnectedLobby();
    });

    this.conn.on('data', (data) => {
      this.handleMessage(data);
    });

    this.conn.on('close', () => {
      console.warn("[P2P] DataChannel closed!");
      this.isConnected = false;
      if (this.connDot) this.connDot.classList.remove('connected');
      if (this.connStatus) this.connStatus.innerText = "DISCONNESSO";
      this.updateLobbyWaitingState();
    });

    this.conn.on('error', (err) => {
      console.warn("[P2P] DataChannel error:", err);
    });
  }

  updateLobbyWaitingState() {
    if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
    if (this.lobbyIcon) this.lobbyIcon.innerText = "⏳";
    if (this.lobbyTitle) this.lobbyTitle.innerText = "IN ATTESA DI TUA SORELLA";
    if (this.lobbySubtitle) this.lobbySubtitle.innerText = "Invia il link per collegare i due smartphone in tempo reale";
    if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'flex';
    if (this.btnStartGame) this.btnStartGame.style.display = 'none';

    if (this.lobbyBadgeP1) {
      this.lobbyBadgeP1.innerText = "PRONTO ✓";
      this.lobbyBadgeP1.className = "lobby-player-badge badge-ready";
    }
    if (this.lobbyBadgeP2) {
      this.lobbyBadgeP2.innerText = "IN ATTESA ⏳";
      this.lobbyBadgeP2.className = "lobby-player-badge badge-waiting";
    }
  }

  showConnectedLobby() {
    if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
    if (this.lobbyIcon) this.lobbyIcon.innerText = "⚡";
    if (this.lobbyTitle) this.lobbyTitle.innerText = "TUA SORELLA È CONNESSA!";
    if (this.lobbySubtitle) this.lobbySubtitle.innerText = "Entrambi i telefoni sono sincronizzati. Clicca per dare il via al duello:";
    if (this.lobbyShareActions) this.lobbyShareActions.style.display = 'none';

    // Update player badges to both READY!
    if (this.lobbyBadgeP1) {
      this.lobbyBadgeP1.innerText = "PRONTO ✓";
      this.lobbyBadgeP1.className = "lobby-player-badge badge-ready";
    }
    if (this.lobbyBadgeP2) {
      this.lobbyBadgeP2.innerText = "CONNESSA ✓";
      this.lobbyBadgeP2.className = "lobby-player-badge badge-ready";
    }

    // Start button visible and clickable on BOTH phones!
    if (this.btnStartGame) {
      this.btnStartGame.style.display = 'block';
      this.btnStartGame.onclick = () => {
        this.btnStartGame.style.display = 'none';
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
        this.send({ type: 'START_MATCH' });
        this.engine.allowStart();
        this.engine.startCountdown();
      };
    }
  }

  setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log("[P2P] Tab restored to foreground!");
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch(e){}
        }
        if (!this.isConnected && !this.isHost) {
          this.connectToHost();
        }
      }
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
    } else if (data.type === 'HANDSHAKE') {
      console.log("[P2P] Handshake received from peer!");
      this.showConnectedLobby();
    } else if (data.type === 'START_MATCH') {
      console.log("[P2P] Match launch command received!");
      if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
      this.engine.allowStart();
      this.engine.startCountdown();
    } else if (data.type === 'START_ROUND') {
      if (!this.isHost) {
        this.engine.allowStart();
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
      const modal = document.getElementById('matchWinnerModal');
      if (modal) modal.style.display = 'none';
      this.engine.allowStart();
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
