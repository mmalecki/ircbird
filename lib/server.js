var http = require('http')
  , static = require('node-static')
  , dnode = require('dnode')
  , irc = require('./ircwrap')
  , couch = require('./couch')

var staticServer = new (static.Server)('./public');

var httpServer = http.createServer(function (req, res) {
  // TODO: make this less hacky after refactoring http-server to use
  // flatiron/union
  if (req.url != '/dnode.js') {
    req.on('end', function () {
      staticServer.serve(req, res);
    });
  }
});
httpServer.listen(8000);

var dnodeServer = dnode(function(remote, conn) {
  var wrapper =
  { getClient: function(userid, password, cb) {
      irc(userid, password, wrapper.conn, cb)
    }
  , fetchChatlines: function(docid, backwards, cb) {
      couch.fetchChatlines(wrapper.conn.user.name, docid, backwards, cb)
    }
  , fetchLastChatlines: function(network, channel, cb) {
      couch.fetchLastChatlines(wrapper.conn.user.name, network, channel, cb)
    }
  }
  Object.defineProperty(wrapper, 'conn', {value: conn})
  return wrapper
})
dnodeServer.listen(httpServer)

