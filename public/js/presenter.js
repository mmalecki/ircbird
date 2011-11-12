var presenter = {};

DNode.connect(function (remote) {
  console.log('Connected to server');
  presenter.remote = remote;
});

presenter.login = function (username, password, callback) {
  presenter.remote.getClient(username, password, function (err, irc) {
    if (err) {
      console.error('Error while getting a client');
      console.error(err);
    }
    else {
      presenter.irc = irc;
    }
    callback(err);
  });
};

