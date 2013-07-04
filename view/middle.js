// view connect middleware

var resource = require('resource');

module['exports'] = function (options) {

  options.prefix = options.prefix || '';

  return function (req, res, next) {
    if (options.view) {
      //
      // If the view was mounted with a prefix and that prefix was 
      // not found in the incoming url, do not attempt to use that view
      //
      // helper function for 'quoting' / 'escaping' regex strings
      var quote = function (str) {
        return str.replace(/(?=[\/\\^$*+?.()|{}[\]])/g, "\\");
      }
      // clean given prefix of any start or end slashes
      var prefix = options.prefix.replace(/\/$/, "").replace(/^\//, "");
      if (prefix.length > 0 && req.url.search("^/?" + quote(prefix)) === -1) {
        return next();
      }
      var _view = options.view;

      // remove prefix and break path into separate parts
      var path = require('url').parse(req.url).pathname;
      var pathWithoutPrefix = path.replace(prefix, '');

      _view = _view.getSubView(pathWithoutPrefix);

      if (_view && _view['index']) {
        _view = _view['index'];
      }

      if(typeof _view === "undefined" ||
        (typeof _view.template === "undefined" &&
        typeof _view.presenter === "undefined")) {
        return next();
      }

      // create function to finish after _view.present
      var finish = function(err, html) {
        // if there is a layout, view the layout too
        if (resource.layout) {
          _view.layout({
            layout: resource.layout.view,
            layoutOptions: {
              request: req,
              response: res,
              data: req.resource.params,
              err: err
            },
            html: html
          }, function(err, result) {
            if (err) { return next(err); }
            res.end(result);
          });
        } else {
          if (err) { return next(err); }
          res.end(html);
        }
      };

      // use a domain to catch errors
      var d = require('domain').create();

      // safety net for uncaught errors
      d.on('error', function(err) {
        return finish(err, "");
      });

      // present the target view
      d.run(function() {
        _view.present({
          request: req,
          response: res,
          data: req.resource.params
        }, finish);
      });
    } else {
      //
      // No view was found, do not use middleware
      //
      next();
    }
  };

};