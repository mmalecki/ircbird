var irc = require('irc')

var IRC_METHODS = 'join part say whois action notice'.split(' ')

// userid -> client mapping
var clients = {}

function getClient(userid, cb) {
  if (clients.hasOwnProperty(userid))
    return cb(null, clients[userid])
  makeClient(userid, function(err, client) {
    if (err) cb(err)
    client = wrapClient(client)
    clients[userid] = client
    cb(null, client)
  })
}

function makeClient(userid, cb) {
  var client = new irc.Client('irc.freenode.net', userid,
  { userName: 'ircbird-'+userid
  , realName: 'ircbird'
  , channels: []
  })
  client.on('connect', function() {
    cb(null, client)
  })
}

function wrapClient(client) {
  var wrapper = {}
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
