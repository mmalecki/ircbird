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

presenter.login = function (username, password, callback) {
  presenter.remote.getClient(username, password, function (err, irc) {
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
  presenter.irc.say(to, msg);
};

