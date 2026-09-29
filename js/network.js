window.FoxNetwork = (() => {
  const socket = io({ transports: ['websocket', 'polling'] });
  let ping = 0;
  let pingTimer = null;

  function emitAck(event, data) {
    return new Promise((resolve) => socket.emit(event, data, resolve));
  }
  function beginPing() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      const t = performance.now();
      socket.emit('pingCheck', Date.now(), () => { ping = Math.round(performance.now() - t); });
    }, 2000);
  }
  beginPing();
  return {
    socket,
    createRoom: (name) => emitAck('createRoom', { name }),
    joinRoom: (name, code) => emitAck('joinRoom', { name, code }),
    reconnectRoom: (code, token) => emitAck('reconnectRoom', { code, token }),
    requestRematch: () => emitAck('requestRematch', {}),
    sendInput: (input) => socket.emit('playerInput', input),
    getPing: () => ping
  };
})();
