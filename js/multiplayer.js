window.FoxMultiplayer = (() => {
  let current = null;
  let handlersBound = false;

  function saveSession(session){localStorage.setItem('foxPickleballSession',JSON.stringify(session))}
  function clearSession(){localStorage.removeItem('foxPickleballSession')}
  function getSession(){try{return JSON.parse(localStorage.getItem('foxPickleballSession')||'null')}catch{return null}}

  function bindGlobalHandlers(){
    if(handlersBound)return;handlersBound=true;
    FoxNetwork.socket.on('snapshot',(s)=>FoxGame.scene()?.applySnapshot(s));
    FoxNetwork.socket.on('gameEvent',({event,payload})=>FoxGame.scene()?.handleEvent(event,payload));
    FoxNetwork.socket.on('partnerDisconnected',()=>window.FoxLobby.showDisconnected());
    FoxNetwork.socket.on('partnerLeft',()=>{clearSession();window.FoxLobby.showPartnerLeft()});
    FoxNetwork.socket.on('matchCountdown',(data)=>window.FoxLobby.showCountdownOverlay(data));
    FoxNetwork.socket.on('roomState',(state)=>{if(current){current.players=state.players;window.FoxLobby.onRoomState(state)}});
  }

  async function create(name){
    bindGlobalHandlers();
    const result=await FoxNetwork.createRoom(name);
    if(result.ok){current={code:result.code,token:result.token,playerIndex:0,players:result.players,name};saveSession(current)}
    return result;
  }
  async function join(name,code){
    bindGlobalHandlers();
    const result=await FoxNetwork.joinRoom(name,code);
    if(result.ok){current={code:result.code,token:result.token,playerIndex:result.playerIndex,players:result.players,name};saveSession(current)}
    return result;
  }
  async function tryReconnect(){
    bindGlobalHandlers();
    const s=getSession();if(!s)return false;
    const r=await FoxNetwork.reconnectRoom(s.code,s.token);
    if(r.ok){current={...s,playerIndex:r.playerIndex,players:r.players};return true}
    clearSession();return false;
  }
  function startGame(){
    if(!current||current.players.length<2)return;
    FoxGame.start({mode:'multiplayer',playerIndex:current.playerIndex,names:[current.players[0].name,current.players[1].name]});
  }
  async function rematch(){return FoxNetwork.requestRematch()}
  function home(){FoxNetwork.socket.emit('leaveRoom',{});clearSession();current=null;FoxGame.stop()}
  function state(){return current}

  bindGlobalHandlers();
  return {create,join,tryReconnect,startGame,rematch,home,state,clearSession};
})();
