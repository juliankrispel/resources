var wd = require('wd')
  , assert = require('assert')
  , resource = require('resource')
  , view = resource.use('view')
  , forms = resource.use('forms')
  , creature = resource.use('creature')
  , _creature
  , server
  , browser = wd.remote();

/*
browser.on('status', function(info) {
  console.log(info.cyan);
});

browser.on('command', function(meth, path, data) {
  console.log(' > ' + meth.yellow, path.grey, data || '');
});

*/

var deepEqual = function(actual, expected) {
  try {
    assert.deepEqual(actual, expected);
  }
  catch (err) {
    return false;
  }
  return true;
}

var tap = require("tap");

//
// add layout that provides bootstrap
//
tap.test('use the layout', function (t) {
  var layout = resource.define('layout');
  t.ok(layout, "layout is defined");
  view.create({
    template:
      /*jshint multistr: true */
      '\
      <html>\
      <head>\
        <title>big forms test</title>\
        <link href="//netdna.bootstrapcdn.com/twitter-bootstrap/2.3.2/css/bootstrap-combined.min.css" rel="stylesheet">\
      </head>\
      <body>\
        <div id="main"><div>\
        <script src="//netdna.bootstrapcdn.com/twitter-bootstrap/2.3.2/js/bootstrap.min.js"></script>\
      </body>\
      </html>\
      '
    }, function(err, _view) {
      t.ok(!err, "no error");
      t.ok(_view, "view is defined");
      layout.view = _view;
      resource.resources.layout = layout;
      resource.layout = layout;
      t.end();
    });
});

tap.test('start the forms resource', function (t) {

  forms.start({}, function(err, app) {
    t.ok(!err, 'no error');
    t.ok(app, 'forms server started');
    server = resource.http.server;
    t.end();
  });

});

tap.test('start the webdriver client', function (t) {

  browser.init({
      browserName: 'firefox'
      , tags : ["examples"]
      , name: "This is an example test"
    }, function() {

    t.ok(true, 'browser started');
    t.end();
  });

});

var baseUrl = "http://localhost:8888";

tap.test("get / with no creatures", function (t) {

  browser.get(baseUrl, function (err, html) {
    browser.title(function(err, title) {
      t.equal(title, 'big forms test', 'title is correct');
      browser.elementByCssSelector('.result', function(err, result) {
        t.ok(!err, 'no error');
        browser.text(result, function(err, resultText) {
          t.ok(!err, 'no error');
          t.equal(resultText, "[]");
          t.end();
        });
      });
    });
  });
});

tap.test("create a creature", function (t) {

  browser.get(baseUrl + "/creature/create", function (err, html) {
    browser.elementByCssSelector('form', function(err, form) {
      t.ok(!err, 'no error');
      browser.submit(form, function() {
        t.ok(!err, 'no error');
        browser.elementByCssSelector('.result', function(err, result) {
          t.ok(!err, 'no error');
          browser.text(result, function(err, resultText) {
            t.ok(!err, 'no error');
            _creature = JSON.parse(resultText);
            t.equal(_creature.type,
              creature.schema.properties.type.default,
              "created creature has default type");
            t.equal(_creature.life,
              creature.schema.properties.life.default,
              "created creature has default life");
            t.equal(_creature.isAwesome,
              creature.schema.properties.isAwesome.default,
              "created creature has default awesomeness");
            t.end();
          });
        });
      });
    });
  });
});


tap.test("get /creature/all", function (t) {

  browser.get(baseUrl, function (err, result) {
    browser.title(function(err, title) {
      browser.elementByClassName('result', function(err, result) {
        t.ok(!err, 'no error');
        browser.text(result, function(err, resultText) {
          t.ok(!err, 'no error');
          t.ok(deepEqual([_creature], JSON.parse(resultText)), "created creature is in all");
          t.end();
        });
      });
    });
  });
});

/*
tap.test('clean up and shut down browser', function (t) {
  browser.quit();
  t.end();
});

tap.test('clean up and shut down server', function (t) {
  server.close();
  t.end();
});
*/