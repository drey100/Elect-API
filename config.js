/* ═══════════════════════════════════════════════════════════
   ElectraBénin — Configuration API frontend
   ✏️  Remplace l'URL par celle de ton backend Railway/Render
═══════════════════════════════════════════════════════════ */
var EB_API = (function() {
  // ✏️ Mettre ici l'URL de ton backend déployé
  var BASE = 'https://electrabenin-api.onrender.com';

  // En local (Live Server), utilise le backend local automatiquement
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    BASE = 'http://localhost:5000';
  }

  return {
    base:     BASE,
    pubs:     BASE + '/api/pubs',
    pubsAll:  BASE + '/api/pubs/all',
    config:   BASE + '/api/config',
    contact:  BASE + '/api/contact',
    messages: BASE + '/api/messages',
    stats:    BASE + '/api/stats',
    login:    BASE + '/api/auth/login',
    statView:  function(id) { return BASE + '/api/stats/view/' + id; },
    statClick: function(id) { return BASE + '/api/stats/click/' + id; },
    togglePub: function(id) { return BASE + '/api/pubs/' + id + '/toggle'; },
    editPub:   function(id) { return BASE + '/api/pubs/' + id; },
    deletePub: function(id) { return BASE + '/api/pubs/' + id; },
    markRead:  function(id) { return BASE + '/api/messages/' + id + '/read'; },
    deleteMsg: function(id) { return BASE + '/api/messages/' + id; }
  };
})();
