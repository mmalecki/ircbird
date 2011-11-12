view = {};

view.log = function (source, msg, type) {
  // TODO: redesign it to use plates
  $('#log').append(source + ': ' + msg + '<br />');
};

view.login = function () {
  console.log('Logging in');
  presenter.login(
    $('#login-username').val(),
    $('#login-password').val(),
    function (err) {
      if (err) {
        // TODO: redesign it to use modals
        view.log('IRCBird', 'Login failed', 'error');
      }
      else {
        view.log('IRCBird', 'Successfully connected to server', 'success');
      }
    }
  );
  return false;
};

$('#login-form').submit(view.login);

