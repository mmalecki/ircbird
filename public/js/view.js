view = {};

view.encodeTabName = function (item) {
  return item[0] == '#' ? 'channel-' + item.slice(1) : 'pm-' + item;
};

view.addTab = function (item) {
  var logTabs = $('#log-tabs');
  var logContent = $('#log-content');

  var encoded = view.encodeTabName(item);
  logTabs.append('<li id="log-tab-' + encoded + '"><a href="#log-' + encoded +
                 '">' + item + '</a></li>');

  logContent.append('<div class="tab-pane" id="log-' + encoded + '"></div>');
};

view.log = function (from, to,  msg) {
  // TODO: redesign it to use plate
  var tab = (to[0] == '#') ? to : from;
  $('#log-' + view.encodeTabName(tab)).append(from + ': ' + msg);
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

