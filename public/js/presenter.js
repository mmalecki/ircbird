var presenter = {};

DNode.connect(function (remote) {
  console.log('Connected to server');
  presenter.remote = remote;
});

presenter.login = function (username, password, handlers, callback) {
  ['onNewChan', 'message', 'selfMessage', 'nick', 'topic', 'join', 'part', 'kick', 'quit', 'kill', 'names', 'topic'].forEach(function(eventName) {
    if (!handlers[eventName]) handlers[eventName] = []
    if (typeof handlers[eventName] === 'function') handlers[eventName] = [handlers[eventName]]
  })
  handlers.message.push(function (from, to, msg) {
    view.log(from, to, msg);
  })
  handlers.selfMessage.push(function (to, msg) {
    view.log(presenter.irc.nick, to, msg);
  })
  handlers.onNewChan.push(function(channel) {
    if (!presenter.chans[channel]) {
      presenter.chans[channel] = {users: {}};
    }
  })
  handlers.names.push(function(channel, nicks) {
    if (!presenter.chans[channel]) {
      presenter.chans[channel] = {users: {}};
    }
    Object.keys(nicks).forEach(function(nick) {
      presenter.chans[channel].users[nick] = nicks[nick]
    })
  })
  handlers.join.push(function(channel, nick) {
    presenter.chans[channel].users[nick] = ''
  })
  handlers.nick.push(function(oldNick, newNick, channels) {
    channels.forEach(function(channel) {
      presenter.chans[channel].users[newNick] = presenter.chans[channel].users[oldNick]
      delete presenter.chans[channel].users[oldNick]
    })
  })
  function disappearFromChannel(channel, nick) {
    delete presenter.chans[channel].users[nick]
  }
  handlers.part.push(disappearFromChannel)
  handlers.kick.push(disappearFromChannel)
  // FIXME we need KILL support!
  function disappearFromServer(nick, reason, channels) {
    channels.forEach(function(channel) {
      delete presenter.chans[channel].users[nick]
    })
  }
  handlers.quit.push(disappearFromServer)
  presenter.remote.getClient(username, password, handlers, function (err, irc) {
    if (err) {
      console.error('Error while getting a client');
      console.error(err);
    }
    else {
      presenter.irc = irc;
      presenter.chans = irc.chans;
    }
    callback(err);
  });
};

presenter.say = function (to, msg) {
  if (msg[0] === '/') {
    var parts = msg.slice(1).split(' ');
    var command = parts[0];
    switch (command) {
      case 'join':
        presenter.join(parts[1]);
        break;
      default:
        view.error(command+' is not a valid command');
        break;
    }
    return;
  }
  presenter.irc.say(to, msg);
};

presenter.join = function (channel, callback) {
  presenter.irc.join(channel, callback);
  view.addTab(channel);
};

