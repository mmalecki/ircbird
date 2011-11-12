var irc = require('irc')
  , couch = require('./couch')

var IRC_METHODS =
{ join: ['channel']
, part: ['channel']
, say: ['chanOrNick', 'message']
, whois: ['nick']
, action: ['chanOrNick', 'message']
, notice: ['chanOrNick', 'message']
, away: ['message']
}

// userid -> client mapping
var clients = {}

function getClient(userid, password, conn, cb) {
  if (typeof userid !== 'string') return cb(new Error('userid must be a string'))
  if (typeof password !== 'string') return cb(new Error('password must be a string'))
  if (typeof cb !== 'function') return cb(new Error('cb must be a function'))
  couch.getAuthedUser(userid, password, function(err, user) {
    if (err) return cb(err)
    if (clients.hasOwnProperty(userid))
      return cb(null, usingClient(clients[userid], conn, false))
    makeClient(user, function(err, client) {
      if (err) return cb(err)
      client = wrapClient(client, user, conn)
      usingClient(client, conn, true)
      clients[userid] = client
      cb(null, client)
    })
  })
}

// called for each connection
function usingClient(wrapper, conn, firstUse) {
  var client = wrapper.client
  if (!firstUse && client._connectedUsers === 0) {
    client.back(true)
  }
  client._connectedUsers++
  // auto-away when the user disconnects
  conn.on('end', function() {
    if (--client._connectedUsers === 0) {
      client.away('auto-away: terminal disconnected', true)
    }
  })
  return wrapper
}

// creates an IRC client and adds some stuff
function makeClient(user, cb) {
  var client = new irc.Client('irc.freenode.net', user.nick,
  { userName: 'ircbird-'+user.name
  , realName: 'ircbird'
  , channels: []
  })
  client.on('connect', function() {
    cb(null, client)
  })
  
  client._awayReason = null
  client._forcedAway = false
  client._connectedUsers = 0
  client.away = function(reason, overwriting) {
    if (typeof reason !== 'string' || reason.length < 1) {
      reason = 'away'
    }
    this.send('AWAY', reason)
    if (!overwriting)
      this._awayReason = reason
    else
      this._forcedAway = true
  }
  client.back = function(onlyDisoverwrite) {
    if (onlyDisoverwrite)
      this._forcedAway = false
    else
      this._awayReason = null
    if (this._awayReason)
      this.send('AWAY', this._awayReason)
    else
      this.send('AWAY')
  }
  
  couch.attachLogger(client, user.name)
}

// wraps an IRC client and returns an object that can represent it over RPC
function wrapClient(client, user, conn) {
  var wrapper = {}
  conn.user = user
  Object.defineProperty(wrapper, 'client', {value: client})
  client.on('message', function(from, to, text) {
    if (to === client.nick || [client.nick].concat(user.highlights).some(function(highlight) {
      return ~text.indexOf(highlight)
    })) {
      client.emit('important-message', from, to, text)
    }
  })
  Object.keys(IRC_METHODS).forEach(function(methodName) {
    var realFn = client[methodName]
    var requiredArgs = IRC_METHODS[methodName]
    wrapper[methodName] = function() {
      var args = arguments
      // silently stop execution on error
      // FIXME tell the client
      if (requiredArgs.some(function(type, i) {
        var arg = args[i]
        switch (type) {
          case 'message': return typeof arg !== 'string'
          case 'channel': return typeof arg !== 'string' || arg.length < 2 || arg[0] !== '#' || arg.indexOf(':') > -1
          case 'chanOrNick': return typeof arg !== 'string'
          case 'nick': return typeof arg !== 'string' || arg.length === 0 || arg[0] === '#'
          default: throw new Error('cant wrap stuff of type "'+type+'"')
        }
      })) return
      realFn.apply(client, arguments)
    }
  })
  // when the browser disconnects, its listeners should be removed
  wrapper.on = function(type, listener) {
    if (typeof type !== 'string' || typeof listener !== 'function')
      throw new Error('invalid args')
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
