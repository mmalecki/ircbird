var view = {};
var scrollManagers = {};
var activeChans = [];

view.escapeHTML = function (text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

view.hexify = function(text) {
  var hexed = ''
  for (var i=0; i<text.length; i++) {
    var hexChar = text.charCodeAt(i).toString(16)
    if (hexChar.length === 1) hexChar = '0'+hexChar
    hexed += hexChar
  }
  return hexed
}

view.dehexify = function(hextext) {
  var text = ''
  for (var i=0; i<hextext.length; i+=2) {
    text += String.fromCharCode(parseInt(hextext.slice(i, i+2), 16))
  }
  return text
}

view.colorWrap = function(item, thingToHash) {
  if (thingToHash == null) thingToHash = item
  return '<span style="color: ' + require('colorhash')(thingToHash, 'css') + '">' + item + '</span>'
};

view.addTab = function (item) {
  if (!$('[data-item="' + item + '"]').length) {
    var logTabs = $('#log-tabs');
    var logContent = $('#log-content');

    var encoded = view.hexify(item);
    logTabs.append('<li data-item="' + item + '"><a href="#log-' + encoded +
                   '">' + item + '</a></li>');

    logContent.append('<div data-item="' + item + '" class="tab-pane" id="log-' +
                      encoded + '"><div class="scrollable-container" id="log-container-'+encoded+'">' +
                        '<div class="textHolder"></div>' +
                        '<div class="scrollbar"><div class="scrollbarCurPos"></div></div>' +
                      '</div></div>');
    var tabPane = $('div[data-item="' + item + '"]');
    scrollManagers[item.toLowerCase()] = new ScrollableBox(tabPane.find('.scrollable-container'), tabPane);
  }
};

view.renderLog = function (from, msg, to) {
  from = view.escapeHTML(from);
  msg = view.escapeHTML(msg);
  from = view.colorWrap(from, from);
  if (to && to[0] === '#') {
    var users = Object.keys(((presenter.chans || {})[to] || {}).users || {})
    msg = replaceAllAll(msg, users, view.colorWrap)
  }
  return from + ': ' + msg + '<br />';
};

view.log = function (from, to,  msg) {
  // TODO: redesign it to use plate
  var tab = (to[0] == '#' || from == presenter.irc.nick) ? to : from;
  if (to[0] === '#' && activeChans.indexOf(to.toLowerCase()) === -1) {
    return console.error('warning: message to '+to+' suppressed');
  }
  if (!scrollManagers[tab.toLowerCase()]) {
    view.addTab(tab);
  }
  var scrollManager = scrollManagers[tab.toLowerCase()];
  var textDiv = scrollManager.textHolder;
  textDiv.append(view.renderLog(from, msg, to));
  scrollManager.afterAppend();
};

view.logServer = function (from, msg) {
  $('div#log-ircbird').append(view.renderLog(from, msg));
};

// FIXME show a modal dialog or log to the current tab
view.error = function(err) {
  console.error(err);
};

view.login = function () {
  console.log('Logging in');
  handlers =
  { onNewChan: function (chan) {
      console.log('we joined '+chan+', fetching logs...');
      presenter.remote.fetchLastChatlines('irc.freenode.net', chan, function(err, lines) {
        if (err) throw err;
        console.log('got '+lines.length);
        activeChans.push(chan.toLowerCase());
        if (!scrollManagers[chan.toLowerCase()]) {
          view.addTab(chan);
        }
        lines.forEach(function(line) {
          if (line.type === 'message') {
            return view.log(line.user.nick, line.to, line.text);
          }
        });
        scrollManagers[chan.toLowerCase()].scrollToEnd();
      });
    }
  };
  presenter.login(
    $('#login-username').val(),
    $('#login-password').val(),
    handlers,
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


function replaceAll(text, needle, replacement) {
  var out = ""
    , index
  while ((index = text.indexOf(needle)) !== -1) {
    out += text.slice(0, index)
    if (text.indexOf('>') < text.indexOf('<') || text.indexOf('<') === -1 && text.indexOf('>') !== -1) {
      out += needle
    } else {
      out += typeof replacement === 'function' ? replacement(needle) : replacement
    }
    text = text.slice(index + needle.length)
  }
  return out + text;
}

function replaceAllAll(text, needles, replacement) {
  needles.forEach(function(needle) {
    text = replaceAll(text, needle, replacement)
  })
  return text
}

// CLASS: ScrollableBox
var SCROLL_LENGTH = 20;
var AUTOSCROLL_LIMIT = 30;

function ScrollableBox(container, hideable) {
  var self = this;
    
  this.container = container;
  this.hideable = hideable;
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
  this.hideable.css('display', 'block');
  var scrollY = this.textHolder.position().top;
  var viewHeight = this.container.innerHeight();
    
  var scaleFactor = this.getScaleFactor();
  var scrollbarHeight = scaleFactor * viewHeight;
  var scrollbarTop = -scaleFactor * scrollY;
    
  this.scrollbarCurPos.css('top', scrollbarTop);
  this.scrollbarCurPos.height(scrollbarHeight);
  this.hideable.css('display', '');
};

ScrollableBox.prototype.scrollToEnd = function() {
  this.hideable.css('display', 'block');
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.height();
  console.log(textHeight)
  this.textHolder.css('top', viewHeight - textHeight);
  this.hideable.css('display', '');
  this.updateScrollbar();
};

ScrollableBox.prototype.afterAppend = function() {
  this.hideable.css('display', 'block');
  var viewHeight = this.container.innerHeight();
  var textHeight = this.textHolder.height();
  var scrollY = this.textHolder.position().top;
  var bottomY = viewHeight - textHeight;
  this.hideable.css('display', '');
  if (scrollY - bottomY < AUTOSCROLL_LIMIT) {
    this.scrollToEnd();
  } else {
    this.updateScrollbar();
  }
};
// END OF CLASS
