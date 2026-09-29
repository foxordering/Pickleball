window.FoxGame = (() => {
  const C = window.FOX_CONFIG;
  let phaserGame = null;
  let activeScene = null;
  let soundEnabled = true;
  let pendingData = null;

  class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }
    init(data) {
      data = (data && data.mode) ? data : (pendingData || {});
      this.mode = 'multiplayer';
      this.names = data.names || ['PLAYER A', 'PLAYER B'];
      this.playerIndex = data.playerIndex ?? 0;
      this.latestSnapshot = null;
      this.prevSnapshot = null;
      this.snapshotReceivedAt = 0;
      this.lastInput = '';
      this.hitFlash = [0, 0];
      this.scoreFlash = 0;
      this.trailPoints = [];
      this.keys = null;
      this.mouseTarget = null;
      this.mouseControl = true;
      this.gameEnded = false;
    }
    preload() {
      this.load.image('court', '/assets/images/pickleball_court_bg_topdown.png');
      this.load.image('red_hold', '/assets/images/red_fox_hold_ball_topdown.png');
      this.load.image('red_move', '/assets/images/red_fox_move_topdown.png');
      this.load.image('red_hit', '/assets/images/red_fox_hit_topdown.png');
      this.load.image('red_wait', '/assets/images/red_fox_wait_topdown.png');
      this.load.image('blue_hold', '/assets/images/blue_fox_hold_ball_topdown.png');
      this.load.image('blue_move', '/assets/images/blue_fox_move_topdown.png');
      this.load.image('blue_hit', '/assets/images/blue_fox_hit_topdown.png');
      this.load.image('blue_wait', '/assets/images/blue_fox_wait_topdown.png');
      this.load.image('ball', '/assets/images/pickleball_ball_topdown.png');
      this.load.audio('paddle', '/assets/sounds/paddle.wav');
      this.load.audio('wall', '/assets/sounds/wall.wav');
      this.load.audio('score', '/assets/sounds/score.wav');
      this.load.audio('countdown', '/assets/sounds/countdown.wav');
      this.load.audio('victory', '/assets/sounds/victory.wav');
    }
    create() {
      activeScene = this;
      this.add.image(C.GAME_WIDTH/2, C.GAME_HEIGHT/2, 'court').setDisplaySize(C.GAME_WIDTH, C.GAME_HEIGHT);
      this.add.rectangle(C.GAME_WIDTH/2, 42, C.GAME_WIDTH, 84, 0x061326, .86);
      this.leftScore = this.add.text(36, 22, '', {fontFamily:'Arial',fontSize:'24px',fontStyle:'bold',color:'#dce9ff'});
      this.rightScore = this.add.text(C.GAME_WIDTH-36, 22, '', {fontFamily:'Arial',fontSize:'24px',fontStyle:'bold',color:'#ffe1de'}).setOrigin(1,0);
      this.centerText = this.add.text(C.GAME_WIDTH/2, 28, '', {fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:'#f39a49'}).setOrigin(.5,0);
      this.leftTeamLabel = this.add.text(36, 55, 'Blue Team (L)', {fontFamily:'Arial',fontSize:'13px',fontStyle:'bold',color:'#6fa8ff'});
      this.rightTeamLabel = this.add.text(C.GAME_WIDTH-36, 55, 'Red Team (R)', {fontFamily:'Arial',fontSize:'13px',fontStyle:'bold',color:'#ff7b6f'}).setOrigin(1,0);
      this.buildLabel = this.add.text(C.GAME_WIDTH-18, C.GAME_HEIGHT-18, `BUILD ${C.BUILD_VERSION} · ONLINE MULTIPLAYER`, {fontFamily:'Arial',fontSize:'12px',color:'#ffffff'}).setOrigin(1,1).setAlpha(.72).setDepth(20);
      // Updated side convention: BLUE is on the LEFT, RED is on the RIGHT.
      this.leftFox = this.add.image(C.COURT.left + C.PLAYER_START_X_OFFSET, 375, 'blue_hold').setDisplaySize(118,158).setDepth(5);
      this.rightFox = this.add.image(C.COURT.right - C.PLAYER_START_X_OFFSET, 375, 'red_hold').setDisplaySize(118,158).setDepth(5);
      this.ball = this.add.image(C.COURT.netX, 375, 'ball').setDisplaySize(30,30).setDepth(7);
      this.trail = this.add.graphics().setDepth(4);
      this.spark = this.add.graphics().setDepth(8);
      // Mouse is the gameplay controller. We send only a desired target;
      // the server remains authoritative over the actual player position.
      const updateMouseTarget = (pointer) => {
        const point = pointer.positionToCamera(this.cameras.main);
        this.mouseTarget = {
          x: Phaser.Math.Clamp(point.x, C.COURT.left, C.COURT.right),
          y: Phaser.Math.Clamp(point.y, C.COURT.top, C.COURT.bottom)
        };
      };
      this.input.on('pointermove', updateMouseTarget);
      this.input.on('pointerdown', updateMouseTarget);
      this.updateScore([0,0]);
    }
    update(time, delta) {
      const input = this.readInput();
      const packed = JSON.stringify(input);
      if (packed !== this.lastInput) {
        FoxNetwork.sendInput(input);
        this.lastInput = packed;
      }
      this.renderNetworkState();
      this.drawTrail(delta);
      this.drawDebug();
    }
    getLocalPlayerState() {
      return this.latestSnapshot?.p?.[this.playerIndex] || this.prevSnapshot?.p?.[this.playerIndex] || null;
    }
    readInput() {
      const localPlayer = this.getLocalPlayerState();
      if (!localPlayer) return {};
      const px = localPlayer.x ?? localPlayer[0];
      const py = localPlayer.y ?? localPlayer[1];
      const target = this.mouseTarget || { x: px, y: py };
      return { targetX: target.x, targetY: target.y };
    }
    applySnapshot(snapshot) {
      this.prevSnapshot = this.latestSnapshot;
      this.latestSnapshot = snapshot;
      this.snapshotReceivedAt = performance.now();
      if (snapshot.s) this.updateScore(snapshot.s);
    }
    renderNetworkState() {
      if (!this.latestSnapshot) return;
      const a = Math.min(1, (performance.now()-this.snapshotReceivedAt)/42);
      if (!this.prevSnapshot) return this.renderSnapshot(this.latestSnapshot);
      const lerp = (x,y)=>x+(y-x)*a;
      const s = JSON.parse(JSON.stringify(this.latestSnapshot));
      for(let i=0;i<2;i++){s.p[i][0]=lerp(this.prevSnapshot.p[i][0],this.latestSnapshot.p[i][0]);s.p[i][1]=lerp(this.prevSnapshot.p[i][1],this.latestSnapshot.p[i][1]);}
      s.b[0]=lerp(this.prevSnapshot.b[0],this.latestSnapshot.b[0]);s.b[1]=lerp(this.prevSnapshot.b[1],this.latestSnapshot.b[1]);
      this.renderSnapshot(s);
    }
    renderSnapshot(s) {
      if (!s?.p?.[1] || !s?.b) return;
      this.leftFox.setPosition(s.p[0][0],s.p[0][1]);
      this.rightFox.setPosition(s.p[1][0],s.p[1][1]);
      this.ball.setPosition(s.b[0],s.b[1]);
      this.updateScore(s.s || [0,0]);
      this.centerText.setText(s.ph === 'countdown' ? 'Get Ready!' : '');
      this.pickCharacterFrames(s);
      this.trailPoints.push({x:s.b[0],y:s.b[1],speed:s.b[4]||C.BALL_START_SPEED,life:1});
      if(this.trailPoints.length>14)this.trailPoints.shift();
    }
    pickCharacterFrames(s) {
      const now = performance.now();
      const p0speed = Math.hypot(s.p[0][2] || 0, s.p[0][3] || 0);
      const p1speed = Math.hypot(s.p[1][2] || 0, s.p[1][3] || 0);
      const leftServing = s.srv === 0;
      const rightServing = s.srv === 1;
      const preServePhase = s.ph === 'countdown' || s.ph === 'pointPause';

      if (this.hitFlash[0] > now) {
        this.leftFox.setTexture('blue_hit');
      } else if (preServePhase) {
        this.leftFox.setTexture(leftServing ? 'blue_hold' : 'blue_wait');
      } else {
        this.leftFox.setTexture(p0speed > 30 ? 'blue_move' : 'blue_wait');
      }

      if (this.hitFlash[1] > now) {
        this.rightFox.setTexture('red_hit');
      } else if (preServePhase) {
        this.rightFox.setTexture(rightServing ? 'red_hold' : 'red_wait');
      } else {
        this.rightFox.setTexture(p1speed > 30 ? 'red_move' : 'red_wait');
      }
    }
    updateScore(score){this.leftScore.setText(`${this.names[0]}   ${score[0]}`);this.rightScore.setText(`${score[1]}   ${this.names[1]}`)}
    drawTrail(delta){this.trail.clear();for(const t of this.trailPoints){t.life-=delta/220; if(t.life<=0)continue; const alpha=Math.max(0,t.life)*.22; const r=4+Math.max(0,(t.speed-C.BALL_START_SPEED)/80);this.trail.fillStyle(0xdfff2f,alpha);this.trail.fillCircle(t.x,t.y,r);}this.trailPoints=this.trailPoints.filter(t=>t.life>0);}
    handleEvent(event,payload){
      if(event==='paddle'){this.hitFlash[payload.player]=performance.now()+140;this.play('paddle');this.spark.clear();this.spark.fillStyle(0xffffff,.75);this.spark.fillCircle(payload.x,payload.y,9);this.time.delayedCall(70,()=>this.spark.clear());}
      if(event==='wall')this.play('wall');
      if(event==='score'){this.play('score');this.cameras.main.flash(110,255,255,255,false);this.updateScore(payload.score);}
      if(event==='serve')this.play('countdown');
      if(event==='matchEnd'){this.gameEnded=true;this.play('victory'); window.dispatchEvent(new CustomEvent('fox-match-end',{detail:{winner:payload.winner,score:payload.score,mode:'multiplayer',names:this.names}}));}
    }
    play(key){if(!soundEnabled)return;try{this.sound.play(key,{volume:.22});}catch(e){}}
    drawDebug(){if(!C.DEBUG_MODE)return;const b=this.latestSnapshot?.b;document.getElementById('debug-panel').textContent=`FPS ${Math.round(this.game.loop.actualFps)}\nPING ${FoxNetwork.getPing()} ms\nBALL ${b?.[4]||0} px/s\nMODE multiplayer`;}
  }

  function ensureGame(data) {
    const wrap=document.getElementById('game-wrap'); wrap.classList.remove('hidden');
    document.getElementById('ui-layer').innerHTML='';
    if (phaserGame) { phaserGame.destroy(true); phaserGame=null; activeScene=null; }
    pendingData = data;
    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-root',
      width: C.GAME_WIDTH,
      height: C.GAME_HEIGHT,
      backgroundColor: '#08162c',
      render:{antialias:true,pixelArt:false,roundPixels:false},
      fps:{target:C.TARGET_FPS,forceSetTimeOut:true},
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
      scene: GameScene
    });
  }
  function stop(){if(phaserGame){phaserGame.destroy(true);phaserGame=null;}activeScene=null;document.getElementById('game-root').innerHTML='';document.getElementById('game-wrap').classList.add('hidden');}
  function setSound(on){soundEnabled=!!on;document.getElementById('sound-toggle').textContent=soundEnabled?'Sound: On':'Sound: Off'}
  document.getElementById('sound-toggle').addEventListener('click',()=>setSound(!soundEnabled));
  if(C.DEBUG_MODE)document.getElementById('debug-panel').classList.remove('hidden');
  return { start:ensureGame, stop, scene:()=>activeScene, setSound };
})();
