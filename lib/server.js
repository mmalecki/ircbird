var express = require('express')
  , dnode = require('dnode')
  , irc = require('./ircwrap')

var app = express.createServer()
app.get('/', function(req, res) {
  res.send('<script src="/dnode.js" type="text/javascript"></script>')
})
app.listen(1337)

var dnodeServer = dnode(function(remote, conn) {
  var wrapper =
  { getClient: function(userid, cb) {
      irc(userid, cb)
    }
  }
  Object.defineProperty(wrapper, 'conn', {value: conn})
  return wrapper
})
dnodeServer.listen(app)
