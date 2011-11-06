var cradle = require('cradle')
  , config = require('../config')
  , pwhash = require('password-hash')
  , db = new cradle.Connection(
           config.couch.url
         , config.couch.port
         , {auth: config.couch.auth}
         ).database(config.couch.dbname)

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
