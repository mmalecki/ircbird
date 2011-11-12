var cradle = require('cradle')
  , equality = require('equality')
  , ideepequals = require('ignoring-deep-equals')
  , assert = require('assert')
  , config = require('../config')
  , pwhash = require('password-hash')
  , hat = require('hat')
  , db = new cradle.Connection(
           config.couch.url
         , config.couch.port
         , {auth: config.couch.auth}
         ).database(config.couch.dbname)

// how long to wait before pushing messages to couch
var MESSAGE_QUEUE_DELAY = 5000

//// USER STUFF

function getUser(name, cb) {
  db.get('ircbird.user:'+name, function(err, user) {
    if (err) return cb(err)
    cb(null, user)
  })
}

function makeUser(name, data, cb) {
  if (typeof data.password !== 'string') return cb('password needed')
  data.name = name
  data.password = pwhash.generate(data.password, {algorithm: 'sha512'})
  db.save('ircbird.user:'+name, data, function(err, res) {
    if (err) return cb(err)
    cb(null)
  })
}

function getAuthedUser(name, password, cb) {
  getUser(name, function(err, user) {
    if (err) return cb(err)
    if (pwhash.verify(password, user.password))
      cb(null, user)
    else
      cb('invalid password')
  })
}

exports.getAuthedUser = getAuthedUser
exports.makeUser = makeUser


//// LOG STUFF
var scheudledLogLines = {}

function handleLine(server, channel, user, json) {
  // TODO: would maybe be nice to also have the hostname and username in here? well, meh
  channel = channel.toLowerCase()
  assert(server.indexOf(':') === -1 && channel.indexOf(':') === -1)
  var queueKey = [server, channel, JSON.stringify(json)].join(':')
  // if the message already exists in the queue
  if (scheudledLogLines[queueKey] && scheudledLogLines[queueKey].some(function(linejson) {
    // first check because someone *might* repeat a message in a millisecond
    if (linejson.allowed.indexOf(user) === -1 && ideepequals(json, linejson, [['allowed'], ['_id'], ['time']])) {
      linejson.allowed.push(user)
      return true
    }
    return false
  })) return
  var time = +new Date()
  json._id = ['ircbird.log', server, channel, time, hat()].join(':')
  json.time = time
  json.allowed = [user]
  if (!scheudledLogLines[queueKey]) scheudledLogLines[queueKey] = []
  scheudledLogLines[queueKey].push(json)
  setTimeout(function() {
    // This might be different from the `json` object in the outer scope!
    var json = scheudledLogLines[queueKey].shift()
    if (scheudledLogLines[queueKey].length === 0)
      delete scheudledLogLines[queueKey]
    var id = json._id
    delete json._id
    db.save(id, json, function(err, res) {
      if (err) throw err
    })
  }, MESSAGE_QUEUE_DELAY)
}

function attachLogger(client, user) {
  client.on('message', function(from, to, text) {
    assert(!!client.opt.server, "client must have a server, but its type is "+typeof client.opt.server)
    handleLine(client.opt.server, to, user,
    { text: text
    , type: 'message'
    , user:
      { nick: from}
    , to: to
    })
  })
  client.on('nick', function(oldnick, newnick, channels) {
    channels.forEach(function(channel) {
      handleLine(client.opt.server, channel, user,
      { type: 'nickchange'
      , oldnick: oldnick
      , newnick: newnick
      , channel: channel
      })
    })
  })
  client.on('topic', function(channel, topic, nick) {
    handleLine(client.opt.server, channel, user,
    { type: 'topic'
    , text: topic
    , nick: nick
    , channel: channel
    })
  })
  client.on('join', function(channel, nick) {
    handleLine(client.opt.server, channel, user,
    { type: 'join'
    , nick: nick
    })
  })
  client.on('part', function(channel, nick) {
    handleLine(client.opt.server, channel, user,
    { type: 'part'
    , nick: nick
    })
  })
  client.on('kick', function(channel, nick, by, reason) {
    handleLine(client.opt.server, channel, user,
    { type: 'kick'
    , nick: nick
    , by: by
    , reason: reason
    })
  })
  // FIXME handle KILL (currently no event for that)
  client.on('quit', function(nick, reason, channels) {
    channels.forEach(function(channel) {
      handleLine(client.opt.server, channel, user,
      { type: 'quit'
      , nick: nick
      , reason: reason
      })
    })
  })
}

exports.attachLogger = attachLogger
