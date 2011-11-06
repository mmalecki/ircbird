var irc = require('irc')
  , couch = require('./couch')

var IRC_METHODS = 'join part say whois action notice'.split(' ')

// userid -> client mapping
var clients = {}

function getClient(userid, password, cb) {
  couch.getAuthedUser(userid, password, function(err, user) {
    if (err) return cb(err)
    if (clients.hasOwnProperty(userid))
      return cb(null, clients[userid])
    makeClient(user, function(err, client) {
      if (err) return cb(err)
      client = wrapClient(client, user)
      clients[userid] = client
      cb(null, client)
    })
  })
}

function makeClient(user, cb) {
  var client = new irc.Client('irc.freenode.net', user.nick,
  { userName: 'ircbird-'+user.name
  , realName: 'ircbird'
  , channels: []
  })
  client.on('connect', function() {
    cb(null, client)
  })
}

function wrapClient(client, user) {
  var wrapper = {}
  client.on('message', function(from, to, text) {
    if (to === client.nick || [client.nick].concat(user.highlights).some(function(highlight) {
      return ~text.indexOf(highlight)
    })) {
      client.emit('important-message', from, to, text)
    }
  })
  IRC_METHODS.forEach(function(method) {
    wrapper[method] = function() {
      client[method].apply(client, arguments)
    }
  })
  // when the browser disconnects, its listeners should be removed
  wrapper.on = function(type, listener) {
    client.on(type, listener)
    this.conn.on('end', function() {
      client.removeListener(type, listener)
    })
  }
  // we don't want disconnects or so to kill the process
  client.on('error', function(){})
  return wrapper
}

module.exports = getClient
