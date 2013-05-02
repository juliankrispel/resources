var resource = require('resource'),
    queue = resource.define('queue');

queue.schema.description = "a queue for resource events";

queue.persist('memory');

queue.property('concurrency', {
  description: 'how many jobs to run at once',
  type: 'number',
  default: 1
});

queue.property('interval', {
  description: 'time interval between processing items (ms)',
  type: 'number',
  default: 5000
});

queue.property('wait', {
  description: 'wait until all running jobs are completed before executing next set',
  type: 'boolean',
  default: true
});

queue.property('repeat', {
  description: 'automatically push completed elements back onto the queue',
  type: 'boolean',
  default: false
});

queue.property('autosave', {
  description: 'automatically save the queue after a processing step',
  type: 'boolean',
  default: true
});

queue.property('elements', {
  description: 'the elements currently inside the queue',
  type: 'array',
  default: []
});

queue.property('started', {
  description: 'whether or not the queue has been started',
  type: 'boolean',
  default: false
});

//
// Basic push/shift methods for queue
//
// Remark: Typically, array shifts are considered expensive, and there is
// a way to optimize this by offsetting the index instead of shifting,
// reusing earlier elements in the array, and then resizing the array (only
// here would slicing be used) and resetting the offsets when the array becomes
// full. That said, this is probably negligible compared to the overhead of
// persisting the queue to a datasource anyway.
//
queue.method('push', push, {
  description: 'push an element onto the queue',
  properties: {
    queue: queue.schema,
    job: {
      properties: {
        method: {
          type: 'string'
        },
        with: {
          type: 'any',
          default: {}
        }
      }
    },
    callback: {
      type: 'function'
    }
  }
});
function push (q, job, callback) {

  var elems = q.elements.push(job);
  if (q.autosave) {
    queue.updateOrCreate(q, callback);
  }
  else {
    callback(null, q);
  }
  return elems;
}

queue.method('shift', shift, {
  description: 'shift an element off the queue',
  properties: {
    queue: queue.schema,
    callback: {
      type: 'function'
    }
  }
});
function shift (q, callback) {
  var shifted = q.elements.shift();
  if (q.autosave) {
    queue.updateOrCreate(q, callback);
  }
  else {
    callback(null, q);
  }
  return shifted;
}

queue.method('take', take, {
  description: 'take `queue.concurrency` elements off the queue',
  properties: {
    queue: queue.schema,
    callback: {
      type: 'function'
    }
  }
});
function take (q, callback) {

  var n = q.concurrency, xs = [];
  //
  // We do multiple shifts instead of a concat because q is actually a different
  // object and not a direct reference. However, the underlying array methods
  // are still bound to the original argument.
  //
  // This should probably be considered a bug in the resource engine.
  //
  while (n && q.elements.length) {
    var elem = q.elements.shift();
    xs.push(elem);
    n--;
  }

  if (q.autosave) {
    queue.updateOrCreate(q, callback);
  }
  else {
    callback(null, q);
  }

  return xs;
}

//
// Lists in python have an analogous method of the same name
// http://docs.python.org/2/library/stdtypes.html#typesseq-mutable
//
queue.method('extend', extend, {
  description: 'extend the queue with an array of elements',
  properties: {
    queue: queue.schema,
    elems: {
      type: 'any'
    },
    callback: {
      type: 'function'
    }
  }
});
function extend(q, xs, callback) {
  //
  // This method suffers the same problems with modifying objects in-place,
  // as explained in the `take` method. Here, we get around this in a
  // similar technique.
  //
  xs.forEach(function (elem) {
    q.elements.push(elem);
  });

  if (q.autosave) {
    queue.updateOrCreate(q, callback);
  }
  else {
    callback(null, q);
  }

  return q.elements;
}


//
// Run a single job by executing the specified method with the specified
// metadata
//
queue.method('run', run, {
  description: 'run a job',
  type: 'object',
  properties: {
    job: {
      properties: {
        method: {
          type: 'string',
          required: true
        },
        with: {
          type: 'any',
          default: {}
        }
      }
    },
    callback: {
      type: 'function'
    }
  }
});
function run(j, callback) {

  var properties = j.method.split('::'),
      method = resource,
      err;

  properties.forEach(function (p) {
    if (typeof method[p] !== 'undefined') {
      method = method[p];
    }
    else if (!err) {
      err = new Error('could not execute method `' + j.method + '`');
    }
  });

  if (typeof method == 'undefined' ) {
    err = new Error('could not execute method `' + j.method + '`');
  }

  if (err) {
    return callback(err);
  }

  method(j.with, callback);
}

//
// This method takes q.concurrency elements off the front of the queue and
// `queue.run`s them.
//
queue.method('process', processQueue, {
  description: 'process elements off the queue',
  properties: {
    queue: queue.schema,
    callback: {
      type: 'function'
    }
  }
});
function processQueue (q, callback) {
  //
  // Process the top q.concurrency elements at once
  //
  var elements = queue.take(q, function (err, q) {
    if (err) {
      return callback(err);
    }

    if (!elements.length) {
      return callback();
    }

    var i = elements.length;

    elements.forEach(function (elem) {
      queue.run(elem, function (err) {
        i--;

        if (err) {
          queue.emit('error', err);
        }

        handleRepeats(function (err, q) {
          if (err) {
            queue.emit('error', err);
          }

          handleAutosaves(function (err, q) {
            if (err) {
              queue.emit('error', err);
            }

            if (i === 0) {
              callback(null, q);
            }
          });
        });

        function handleRepeats(cb) {
          //
          // If element repeating is turned on, push the just-processed element
          // back onto the queue
          //
          if (q.repeat) {
            queue.push(q, elem, cb);
          }
          else {
            cb(null, q);
          }
        }

        function handleAutosaves(cb) {
          //
          // If autosave is turned on, save the current queue.
          //
          if (q.autosave) {
            queue.updateOrCreate(q, cb);
          }
        }
      });
    });
  });
}

//
// TODO: `unload` method
//
queue.method('load', load, {
  description: 'start processing a queue',
  properties: {
    queue: queue.schema
  }
});
function load(q) {

  q.started = true;
  queue.updateOrCreate(q, function (err, q) {
    if (err) {
      queue.emit('error', err);
    }

    _process();

    function _process() {
      queue.get(q.id, function (err, q) {
        if (err) {
          queue.emit('error', err);
        }
        var completed = false,
            timedOut = false;

        if (q.started) {
          //
          // Process again at the end of the timeout *if* the last process step
          // completed
          //
          q._loop = setTimeout(function () {
            //
            // If waiting is turned off, always process the next set of elements
            //
            if (q.started && (completed || !q.wait)) {
              _process();
            }
            else {
              timedOut = true;
            }
          }, q.interval);

          queue.process(q, function (err, result) {

            if (err) {
              //
              // Remark: Emit error, keep going (for now, may change behavior)
              //
              // TODO: Attach some context to the error?
              //
              queue.emit('error', err);
            }

            completed = true;

            //
            // If the timeout occurred while the process step was still running,
            // execute it late
            //
            if (timedOut && q.started) {
              _process();
            }
          });
        }
      });
    }
  });
}

queue.method('unload', unload, {
  description: 'start processing a queue',
  properties: {
    queue: queue.schema
  }
});
function unload(q) {
  clearInterval(q._loop);
  q.started = false;

  queue.updateOrCreate(q, function (err, res) {
    if (err) {
      queue.emit('error', err);
    }
  });
}

//
// after hooks to add methods to instances of queue
//
queue.after('create', addMethods);
queue.after('get', addMethods);
queue.after('updateOrCreate', addMethods);
queue.after('all', addMethods);
queue.after('find', addMethods);
function addMethods (instance, next) {
  //
  // In cases of 'all' and 'find', "instance" will actually be an *array* of
  // queue instances.
  //
  if (Array.isArray(instance)) {
    //
    // Use "some" to short
    //
    instance.some(function (q, i) {
      var err;
      //
      // Remark: addMethods runs synchronously
      //
      addMethods(q, function (e, _q) {
        if (e) {
          err = e;
          return;
        }
        instance[i] = _q;
      });

      if (err) {
        next(err);
      }

      //
      // If err is truthy, this will short-circuit the .some method
      //
      return err;
    });

    return next(null, instance);
  }

  //
  // Assuming instance is *not* an array, add all the bound methods to
  // the instance
  //
  [
    'push',
    'shift',
    'take',
    'extend',
    'process',
    'load',
    'unload'
  ].forEach(function (m) {
    instance[m] = function () {
      return queue[m].apply(null, [instance].concat([].slice.call(arguments)));
    }
  });

  //
  // Alias "start" to "load" at the instance level
  //
  instance.start = instance.load;
  instance.stop = instance.unload;

  next(null, instance);
}

process.nextTick(function () {
  if (!queue.listeners('error')) {
    queue.on('error', function (err) {
      resource.logger.error('Error while processing queue:');
      resource.logger.error(err);
    });
  }
});
exports.queue = queue;
