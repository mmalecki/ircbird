var express = require('express')
  , dnode = require('dnode')
  , irc = require('./ircwrap')
  , couch = require('./couch')

var app = express.createServer()
app.get('/', function(req, res) {
  res.send('<script src="/dnode.js" type="text/javascript"></script>')
})
app.listen(1337)

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
dnodeServer.listen(app)
