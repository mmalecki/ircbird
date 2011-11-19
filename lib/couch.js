var cradle = require('cradle')
  , equality = require('equality')
  , ideepequals = require('ignoring-deep-equals')
  , assert = require('assert')
  , config = require('../config')
  , db_relax = new (require('relax'))(config.couch)
  , pwhash = require('password-hash')
  , hat = require('hat')
  , unique = require('./helpers').unique
  , db = new cradle.Connection(
           config.couch.url
         , config.couch.port
         , {auth: config.couch.auth}
         ).database(config.couch.db_name)

exports.db = db_relax

// how long to wait before pushing messages to couch
var MESSAGE_QUEUE_DELAY = 5000
  , CHATLINES_FETCH_LIMIT = 300
  , CHATLINES_LOW_LIMIT = 200

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


//// STORING LOGS STUFF
var scheduledLogLines = {}
var unstoredLogLines = []

function handleLine(server, channel, user, json) {
  // TODO: would maybe be nice to also have the hostname and username in here? well, meh
  channel = channel.toLowerCase()
  assert(server.indexOf(':') === -1 && channel.indexOf(':') === -1)
  var queueKey = [server, channel, JSON.stringify(json)].join(':')
  // if the message already exists in the queue
  if (scheduledLogLines[queueKey] && scheduledLogLines[queueKey].some(function(linejson) {
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
  if (!scheduledLogLines[queueKey]) scheduledLogLines[queueKey] = []
  scheduledLogLines[queueKey].push(json)
  unstoredLogLines.push(json)
  setTimeout(function() {
    // This might be different from the `json` object in the outer scope!
    var json = scheduledLogLines[queueKey].shift()
    if (scheduledLogLines[queueKey].length === 0)
      delete scheduledLogLines[queueKey]
    var id = json._id
    db.save(id, json, function(err, res) {
      unstoredLogLines.splice(unstoredLogLines.indexOf(json), 1)
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


//// FETCHING LOGS STUFF
exports.fetchChatlines = function(user, docid, backwards, cb) {
  if (typeof user !== 'string') return cb(new Error('user must be a string'))
  if (typeof docid !== 'string') return cb(new Error('docid must be a string'))
  if (typeof backwards !== 'boolean') return cb(new Error('backwards must be a boolean'))
  if (typeof cb !== 'function') return cb(new Error('cb must be a function'))
  var joinedResults = []
  function fetchMore() {
    console.log('got '+joinedResults.length+', fetching moar...')
    _fetchChatlines(user, docid, backwards, function(err, results) {
      if (err) return cb(err)
      if (results === null) return cb(null, joinedResults)
      var lastid = results.lastid
      if (backwards)
        // decrement docid by one. assumes that the last char is a digit!
        // we don't want a slash there, so let's take a dot
        docid = lastid.slice(0, lastid.length-1) + String.fromCharCode(lastid.charCodeAt(lastid.length-1)-1).replace(/\//, '.')
      else
        docid = results.lastid + '0'
      joinedResults = joinedResults.concat(results.rows)
      if (joinedResults.length >= CHATLINES_LOW_LIMIT)
        cb(null, joinedResults)
      else
        fetchMore()
    })
  }
  fetchMore()
}

// Gives you all N last chatlines from before this function was called.
// Unsorted, but without holes.
exports.fetchLastChatlines = function(user, network, channel, cb) {
  var idstart = ['ircbird.log', network, channel, ''].join(':')
  var unstoredLogLinesOnIce = unstoredLogLines.concat()
  exports.fetchChatlines(user, idstart+'Z', true, function(err, rows) {
    if (err) return cb(err)
    rows = rows.concat(unstoredLogLinesOnIce.filter(function(row) {
      return row._id.slice(0, idstart.length) === idstart
    }))
    rows = unique(rows, '_id').sort(function(a, b) {
      return a.time - b.time
    })
    cb(null, rows)
  })
}

function _fetchChatlines(user, docid, backwards, cb) {
  if (typeof user !== 'string') return cb(new Error('"user" is a '+typeof user))
  var options =
  { descending: backwards
  , limit: CHATLINES_FETCH_LIMIT
  , include_docs: true
  , startkey: JSON.stringify(docid)
  , endkey: JSON.stringify(docid.split(':').slice(0, 3).join(':') + (backwards ? ':' : ':Z'))
  }
  db.query('GET', '_all_docs', options, function(err, result) {
    if (err) return cb(err)
    result = result.map(function(a){return a}) // FIXME this is because cradle is FUCKING STUPID, fix cradle
    if (result.length === 0) return cb(null, null)
    var lastid = result[result.length-1]._id
    result = result.filter(function(entry) {
      return entry && Array.isArray(entry.allowed) && entry.allowed.indexOf(user) > -1
    })
    result.forEach(function(entry) {
      delete entry.allowed
    })
    cb(null, {rows: result, lastid: lastid})
  })
}
