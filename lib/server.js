var express = require('express')
  , dnode = require('dnode')
  , irc = require('./ircwrap')

var app = express.createServer()
app.get('/', function(req, res) {
  res.send('<script src="/dnode.js" type="text/javascript"></script>')
})
app.listen(1337)

var dnodeServer = dnode({
  getClient: function(userid, cb) {
    irc(userid, cb)
  }
})
dnodeServer.listen(app)
