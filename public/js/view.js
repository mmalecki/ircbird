var view = {};

view.escapeHTML = function (text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

view.encodeTabName = function (item) {
  return item[0] == '#' ? 'channel-' + item.slice(1) : 'pm-' + item;
};

view.addTab = function (item) {
  if (!$('[data-item="' + item + '"]').length) {
    var logTabs = $('#log-tabs');
    var logContent = $('#log-content');

    var encoded = view.encodeTabName(item);
    logTabs.append('<li data-item="' + item + '"><a href="#log-' + encoded +
                   '">' + item + '</a></li>');

    logContent.append('<div data-item="' + item + '" class="tab-pane" id="log-' +
                      encoded + '"></div>');
  }
};

view.renderLog = function (from, msg) {
  return view.escapeHTML(from) + ': ' + view.escapeHTML(msg) + '<br />';
};

view.log = function (from, to,  msg) {
  // TODO: redesign it to use plate
  var tab = (to[0] == '#' || from == presenter.irc.nick) ? to : from;
  var tabDiv = $('div[data-item="' + tab + '"]');
  if (!tabDiv.length) {
    view.addTab(tab);
    tabDiv = $('div[data-item="' + tab + '"]');
  }
  tabDiv.append(view.renderLog(from, msg));
};

view.logServer = function (from, msg) {
  $('div#log-ircbird').append(view.renderLog(from, msg));
};

view.login = function () {
  console.log('Logging in');
  presenter.login(
    $('#login-username').val(),
    $('#login-password').val(),
    function (err) {
      if (err) {
        // TODO: redesign it to use modals
        view.logServer('IRCBird', 'Login failed');
      }
      else {
        view.logServer('IRCBird', 'Successfully connected to server');
      }
    }
  );
  return false;
};
$('#login-form').submit(view.login);

view.say = function () {
  var sayInput = $('#say-input');
  presenter.say(view.currentItem, sayInput.val());
  sayInput.val('');
  return false;
};
$('#say-form').submit(view.say);

view.tabChanged = function (e) {
  view.currentItem = e.target.parentElement.getAttribute('data-item');
};
$('#log-tabs').change(view.tabChanged);

