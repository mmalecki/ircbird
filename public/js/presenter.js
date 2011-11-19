var presenter = {};

DNode.connect(function (remote) {
  console.log('Connected to server');
  presenter.remote = remote;
});

presenter._listeners = function () {
  presenter.irc.on('message', function (from, to, msg) {
    view.log(from, to, msg);
  });
  presenter.irc.on('selfMessage', function (to, msg) {
    view.log(presenter.irc.nick, to, msg);
  });
};

presenter.login = function (username, password, onNewChan, callback) {
  presenter.remote.getClient(username, password, onNewChan, function (err, irc) {
    if (err) {
      console.error('Error while getting a client');
      console.error(err);
    }
    else {
      presenter.irc = irc;
      presenter._listeners();
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

