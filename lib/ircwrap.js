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
      return cb(null, usingClient(wrapClient(clients[userid], user, conn), conn, false))
    makeClient(user, function(err, client) {
      if (err) return cb(err)
      clients[userid] = client
      client = wrapClient(client, user, conn)
      usingClient(client, conn, true)
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
  , channels: user.channels || []
  })
  client.on('connect', function() {
    cb(null, client)
  })
  client.on('abort', function() {
    delete clients[user._id]
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
      var args = [].slice.call(arguments)
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
      // Note: We don't update the in-memory state for this stuff because it
      // should represent the current state anyway.
      if (methodName === 'join') {
        couch.db.alter(user._id, function(user) {
          if (user.channels.indexOf(args[0]) === -1)
            user.channels.push(args[0])
          return user
        }, dummyCb)
      } else if (methodName === 'part') {
        couch.db.alter(user._id, function(user) {
          var index = user.channels.indexOf(args[0])
          if (index !== -1)
            user.channels.splice(index, 1)
          return user
        }, dummyCb)
      }
      realFn.apply(client, arguments)
    }
  })

  wrapper.__defineGetter__('nick', function () {
    return client.nick;
  });

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

function dummyCb(err) {
  if (err) {
    if (err.reason) console.error(err.reason)
    throw err.error || err
  }
}

module.exports = getClient
