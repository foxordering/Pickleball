(async function(){
  if(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)&&innerWidth<900){document.getElementById('mobile-warning').classList.remove('hidden');return}
  FoxLobby.home();
  FoxNetwork.socket.on('connect',async()=>{
    const session=localStorage.getItem('foxPickleballSession');
    if(session){const ok=await FoxMultiplayer.tryReconnect();if(ok){const st=FoxMultiplayer.state();if(st?.players?.length===2)FoxLobby.showPartnerFound(st.players);else if(st)FoxLobby.showWaiting(st.code)}}
  });
})();
