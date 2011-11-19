var view = {};
var scrollManagers = {};
var activeChans = [];

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
                      encoded + '"><div class="scrollable-container" id="log-container-'+encoded+'">' +
                        '<div class="textHolder"></div>' +
                        '<div class="scrollbar"><div class="scrollbarCurPos"></div></div>' +
                      '</div></div>');
    scrollManagers[item] = new ScrollableBox($('div[data-item="' + item + '"]').find('.scrollable-container'));
  }
};

view.renderLog = function (from, msg) {
  return view.escapeHTML(from) + ': ' + view.escapeHTML(msg) + '<br />';
};

view.log = function (from, to,  msg) {
  // TODO: redesign it to use plate
  var tab = (to[0] == '#' || from == presenter.irc.nick) ? to : from;
  if (to[0] === '#' && activeChans.indexOf(to) === -1) {
    return console.error('warning: message to '+to+' suppressed');
  }
  if (!scrollManagers[tab]) {
    view.addTab(tab);
  }
  var scrollManager = scrollManagers[tab];
  var textDiv = scrollManager.textHolder;
  textDiv.append(view.renderLog(from, msg));
  scrollManager.afterAppend();
};

view.logServer = function (from, msg) {
  $('div#log-ircbird').append(view.renderLog(from, msg));
};

view.login = function () {
  console.log('Logging in');
  presenter.login(
    $('#login-username').val(),
    $('#login-password').val(),
    function (chan) {
      console.log('we joined '+chan+', fetching logs...');
      presenter.remote.fetchLastChatlines('irc.freenode.net', chan, function(err, lines) {
        if (err) throw err;
        console.log('got '+lines.length);
        activeChans.push(chan);
        if (!scrollManagers[chan]) {
          view.addTab(chan);
        }
        lines.reverse().forEach(function(line) {
          if (line.type === 'message') {
            return view.log(line.user.nick, line.to, line.text);
          }
        });
        $('#log-'+view.encodeTabName(chan)).css('display', 'block');
        scrollManagers[chan].scrollToEnd();
        $('#log-'+view.encodeTabName(chan)).css('display', '');
      });
    },
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



// CLASS: ScrollableBox
var SCROLL_LENGTH = 20;
var AUTOSCROLL_LIMIT = 30;

function ScrollableBox(container) {
  var self = this;
    
  this.container = container;
  this.textHolder = this.container.find('.textHolder');
  this.scrollbar = this.container.find('.scrollbar');
  this.scrollbarCurPos = this.container.find('.scrollbarCurPos');
  
  var mouseY = null;
  this.scrollbarCurPos.mousedown(function(evt) {
    mouseY = evt.pageY;
  });
  $(document).mouseup(function() {
    mouseY = null;
  });
  this.scrollbarCurPos.mousemove(function(evt) {
    if (mouseY != null) {
      self.scrollbarMove(evt.pageY - mouseY);
      mouseY = evt.pageY;
    }
  });
  this.container.mousewheel(function(evt, delta) {
    self.moveText(SCROLL_LENGTH*delta);
  });
}

ScrollableBox.prototype.getScaleFactor = function() {
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.innerHeight();
  return viewHeight / textHeight;
};

ScrollableBox.prototype.scrollbarMove = function(diff) {
  var scaleFactor = this.getScaleFactor();
  this.moveText(-diff / scaleFactor);
};

ScrollableBox.prototype.moveText = function(diff) {
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.innerHeight();
  var pos = this.textHolder.position();
  var scrollY = pos.top;
  scrollY += Math.round(diff);
  scrollY = Math.min(scrollY, 0);
  scrollY = Math.max(scrollY, -(textHeight - viewHeight));
  this.textHolder.css('top', scrollY);
  this.updateScrollbar();
};

ScrollableBox.prototype.updateScrollbar = function() {
  var scrollY = this.textHolder.position().top;
  var viewHeight = this.container.innerHeight();
    
  var scaleFactor = this.getScaleFactor();
  var scrollbarHeight = scaleFactor * viewHeight;
  var scrollbarTop = -scaleFactor * scrollY;
    
  this.scrollbarCurPos.css('top', scrollbarTop);
  this.scrollbarCurPos.height(scrollbarHeight);
};

ScrollableBox.prototype.scrollToEnd = function() {
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.height();
  console.log(textHeight)
  this.textHolder.css('top', viewHeight - textHeight);
  this.updateScrollbar();
};

ScrollableBox.prototype.afterAppend = function() {
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.height();
  var scrollY = this.textHolder.position().top;
  var bottomY = viewHeight - textHeight;
  if (scrollY - bottomY < AUTOSCROLL_LIMIT) {
    this.scrollToEnd();
  } else {
    this.updateScrollbar();
  }
};
// END OF CLASS
