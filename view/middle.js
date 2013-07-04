// view connect middleware

module['exports'] = function (options) {

  options.prefix = options.prefix || '';

  return function (req, res, next) {
    if (options.view) {
      //
      // If the view was mounted with a prefix and that prefix was not found in the incoming url,
      // do not attempt to use that view
      //
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
      var parts = pathWithoutPrefix.split('/');

      parts.forEach(function(part) {
        if(part.length > 0 && typeof _view !== 'undefined') {
          _view = _view[part];
        }
      });
      if (_view && _view['index']) {
        _view = _view['index'];
      }
      if(typeof _view === "undefined" ||
        typeof _view.template === "undefined" ||
        typeof _view.presenter === "undefined") {
        return next();
      }
      _view.present({
        request: req,
        response: res,
        data: req.resource.params
        }, function (err, rendered) {
        res.end(rendered);
      });
    } else {
      //
      // No view was found, do not use middleware
      //
      next();
    }
  };

};