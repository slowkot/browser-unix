var through = require('through');
var resumer = require('resumer');
var split = require('split');
var duplexer = require('duplexer');
var minimist = require('minimist');
var parents = require('parents');
var path = require('path');

var fs = require('bashful-fs');

exports = module.exports = function (cmd, args, opts) {
    if ({}.hasOwnProperty.call(exports, cmd)) {
        return exports[cmd](args, opts);
    }
};

exports.ls = function (args, opts) {
    var tr = resumer();
    var argv = minimist(args);
    var dirs = argv._.length ? argv._ : ['.'];
    
    process.nextTick(function next () {
        if (dirs.length === 0) {
            tr.queue(null);
            tr.emit('exit', 0);
            return;
        }
        var file = path.resolve(opts.cwd, dirs.shift());
        fs.stat(file, function (err, s) {
            if (err) {
                tr.queue(err + '\n')
                tr.queue(null);
                tr.emit('exit', 1);
            }
            else if (!argv.d && s.isDirectory()) {
                fs.readdir(file, function (err, files) {
                    if (err) {
                        tr.queue(err + '\n')
                        tr.queue(null);
                        tr.emit('exit', 1);
                    }
                    else {
                        tr.queue(files.concat('').join('\n'));
                        next();
                    }
                });
            }
            else {
                tr.queue(file + '\n');
                next();
            }
        });
    });
    
    return tr;
};

exports.rm = function (args, opts) {
    var tr = resumer();
    var argv = minimist(args, { boolean: [ 'r', 'f' ] });
    var dirs = argv._.length ? argv._ : ['.'];
    
    process.nextTick(function next () {
        if (dirs.length === 0) {
            tr.queue(null);
            tr.emit('exit', 0);
            return;
        }
        var file = path.resolve(opts.cwd, dirs.shift());
        fs.stat(file, function (err, s) {
            if (err && err.code === 'ENOENT') {
                if (argv.f) return next();
                tr.queue('rm: cannot remove `' + file + '\': '
                    + 'No such file or directory\n'
                );
                tr.queue(null);
                tr.emit('exit', 1);
            }
            else if (err) {
                if (argv.f) return next();
                tr.queue(err + '\n')
                tr.queue(null);
                tr.emit('exit', 1);
            }
            else if (!argv.r && s.isDirectory()) {
                tr.queue('rm: cannot remove `'
                    + file + '\': Is a directory\n');
                tr.queue(null);
                tr.emit('exit', 1);
            }
            else if (s.isDirectory()) {
                fs.readdir(file, function (err, files) {
                    if (err) {
                        if (argv.f) return next();
                        tr.queue(err + '\n')
                        tr.queue(null);
                        tr.emit('exit', 1);
                    }
                    else if (files.length) {
                        dirs.push.apply(dirs, files.map(function (d) {
                            return path.resolve(file, d);
                        }).concat(file));
                        next();
                    }
                    else fs.unlink(file, function (err) {
                        if (err && !argv.f) {
                            tr.queue(err + '\n')
                            tr.queue(null);
                            tr.emit('exit', 1);
                        }
                        else next()
                    })
                });
            }
            else fs.unlink(file, function (err) {
                if (err && !argv.f) {
                    tr.queue(err + '\n')
                    tr.queue(null);
                    tr.emit('exit', 1);
                }
                else next()
            });
        });
    });
    
    return tr;
};

exports.clear = function (args, opts) {
    var tr = resumer();
    tr.queue('\x1b[H\x1b[2J');
    tr.queue(null);
    return tr;
};

exports.mkdir = function (args, opts) {
    var tr = resumer();
    var argv = minimist(args, { boolean: [ 'p' ] });
    if (argv._.length === 0) {
        process.nextTick(function () {
            tr.queue('mkdir: missing operand\n');
            tr.queue('Try `mkdir --help\' for more information.\n');
            tr.queue(null);
            tr.emit('exit', 1);
        });
        return tr;
    }
    var dirs = argv._;
    
    process.nextTick(function next () {
        if (dirs.length === 0) {
            tr.queue(null);
            tr.emit('exit', 0);
            return;
        }
        var file = path.resolve(opts.cwd, dirs.shift());
        fs.mkdir(file, function (err) {
            if (err && err.code === 'ENOENT' && argv.p) {
                dirs.push.apply(dirs, parents(file).reverse());
                next();
            }
            else if (err && err.code === 'EEXIST' && argv.p) {
                next();
            }
            else if (err) {
                tr.queue(err + '\n');
                tr.queue(null);
                tr.emit('exit', 1);
            }
            else next()
        });
    });
    
    return tr;
};

exports.grep = function (args, opts) {
    var self = this;
    var argv = minimist(args);
    if (argv._.length === 0) {
        var tr = through();
        process.nextTick(function () {
            tr.queue('Usage: grep [OPTION]... PATTERN [FILE]...\n');
            tr.queue('Try `grep --help\' for more information.\n');
            tr.queue(null);
            tr.emit('exit', 1);
        });
        return tr;
    }
    var re = RegExp(argv._.shift());
    
    var sp = split();
    var dup = duplexer(sp, sp.pipe(through(function (line) {
        if (re.test(line)) this.queue(line + '\n');
    })));
    
    (function next (files) {
        if (files.length === 0) {
            dup.queue(null);
            dup.emit('exit', 0);
        }
        else {
            var stream = fs.createReadStream(files.shift());
            stream.pipe(dup, { end: false });
            stream.pipe(through(null, next));
        }
    })(argv._);
    
    return dup;
};
