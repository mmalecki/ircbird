var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        var y = cwd || '.';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = Object_keys(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key)
    return res;
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = function (fn) {
    setTimeout(fn, 0);
};

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
    function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/node_modules/colorhash/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {}
});

require.define("/node_modules/colorhash/index.js", function (require, module, exports, __dirname, __filename) {
    var blueMidnightWish = require('insanehash').crypto.bmw

function rangeport(num, fromStart, fromEnd, toStart, toEnd) {
  num -= fromStart
  num /= fromEnd - fromStart
  num *= toEnd - toStart
  num += toStart
  return num
}

module.exports = function(str, format) {
  function component(i) {
    var srcNum = parseInt(hashstr.slice(4*i, 4*i+4), 16)
    return Math.floor(rangeport(srcNum, 0, 0xffff, 0x80, 0xff))
  }
  var hashstr = blueMidnightWish(str)
  var result = [component(0), component(1), component(2)]
  if (format == null)
    return result
  else if (format === 'css')
    return '#'+result.map(function(n){return n.toString(16)}).join('')
  else
    throw new Error('unknown format')
}

});

require.define("/node_modules/insanehash/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./index"}
});

require.define("/node_modules/insanehash/index.js", function (require, module, exports, __dirname, __filename) {
    module.exports = require('./lib/crypto');
});

require.define("/node_modules/insanehash/lib/crypto.js", function (require, module, exports, __dirname, __filename) {
    (function () {
   "use strict";
   exports.crypto = {
	blake32 : (function () {
		var iv; var g; var r; var block; var constants; var sigma; var circ; var state; var message; var output; var two32;
		two32 = 4 * (1 << 30);
		iv = [
			0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
			0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
		];
		constants = [
			0x243F6A88, 0x85A308D3, 0x13198A2E, 0x03707344, 
			0xA4093822, 0x299F31D0, 0x082EFA98, 0xEC4E6C89, 
			0x452821E6, 0x38D01377, 0xBE5466CF, 0x34E90C6C, 
			0xC0AC29B7, 0xC97C50DD, 0x3F84D5B5, 0xB5470917
		];
		output = function (i) {
			if (i < 0) {
				i += two32;
			}
			return ("00000000" + i.toString(16)).slice(-8);
		};
		/* The spec calls for the sigma values at 2i and 2i + 1 to be passed into 
		 * the g function simultaneously. This implementation uses a byte array to
		 * perform this task.
		 */
		sigma = [
			[16, 50, 84, 118, 152, 186, 220, 254], [174, 132, 249, 109, 193, 32, 123, 53], 
			[139, 12, 37, 223, 234, 99, 23, 73], [151, 19, 205, 235, 98, 165, 4, 143], 
			[9, 117, 66, 250, 30, 203, 134, 211], [194, 166, 176, 56, 212, 87, 239, 145], 
			[92, 241, 222, 164, 112, 54, 41, 184], [189, 231, 28, 147, 5, 79, 104, 162], 
			[246, 158, 59, 128, 44, 125, 65, 90], [42, 72, 103, 81, 191, 233, 195, 13]
		];
		circ = function (a, b, n) {
			var s = state[a] ^ state[b];
			state[a] = (s >>> n) | (s << (32 - n));
		};
		g = function (i, a, b, c, d) {
			var u = block + sigma[r][i] % 16, v = block + (sigma[r][i] >> 4);
			a %= 4;
			b = 4 + b % 4;
			c = 8 + c % 4;
			d = 12 + d % 4;
			state[a] += state[b] + (message[u] ^ constants[v % 16]);
			circ(d, a, 16);
			state[c] += state[d];
			circ(b, c, 12);
			state[a] += state[b] + (message[v] ^ constants[u % 16]);
			circ(d, a, 8);
			state[c] += state[d];
			circ(b, c, 7);
		};
		return function (msg, salt) {
			if (! (salt instanceof Array && salt.length === 4)) {
				salt = [0, 0, 0, 0];
			}
			var pad; var chain; var len; var L; var last_L; var last; var total; var i; 
			chain = iv.slice(0);
			pad = constants.slice(0, 8);
			for (r = 0; r < 4; r += 1) {
				pad[r] ^= salt[r];
			}
			// pre-padding bit length of the string.
			len = msg.length * 16;
			last_L = (len % 512 > 446 || len % 512 === 0) ? 0 : len;
			// padding step: append a 1, then a bunch of 0's until we're at 447 bits,
			// then another 1 (note: 448/16 = 28), then len as a 64-bit integer.
			if (len % 512 === 432) {
				msg += "\u8001";
			} else {
				msg += "\u8000";
				while (msg.length % 32 !== 27) {
					msg += "\u0000";
				}
				msg += "\u0001";
			}
			message = [];
			for (i = 0; i < msg.length; i += 2) {
				message.push(msg.charCodeAt(i) * 65536 + msg.charCodeAt(i + 1));
			}
			message.push(0);
			message.push(len);
			last = message.length - 16;
			total = 0;
			for (block = 0; block < message.length; block += 16) {
				total += 512;
				L = (block === last) ? last_L : Math.min(len, total);
				state = chain.concat(pad);
				state[12] ^= L;
				state[13] ^= L;
				for (r = 0; r < 10; r += 1) {
					for (i = 0; i < 8; i += 1) {
						if (i < 4) {
							g(i, i, i, i, i);
						} else {
							g(i, i, i + 1, i + 2, i + 3);
						}
					}
				}
				for (i = 0; i < 8; i += 1) {
					chain[i] ^= salt[i % 4] ^ state[i] ^ state[i + 8];
				}
			}
			return chain.map(output).join("");
		};
	}()),

	bmw : (function () {
		var iv, final, u, add_const, sc, fc, ec_s, ec_n, ec2_rot, hex, output_fn, compress, rot, s, fold;
		// output formatting function, giving the little-endian hex display of a number.
		hex = function (n) {
			return ("00" + n.toString(16)).slice(-2);
		};
		output_fn = function (n) {
			return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
		};
		// initial constants.
		iv = [];
		final = [];
		add_const = [];
		for (u = 0; u < 16; u += 1) {
			final[u] = 0xaaaaaaa0 + u;
			iv[u] = 0x40414243 + u * 0x04040404;
			add_const[u] = (u + 16) * 0x5555555;
		}
		rot = function (x, n) {
			return (x << n) + (x >>> (32 - n));
		};
		sc = [19, 23, 25, 29, 4, 8, 12, 15, 3, 2, 1, 2, 1, 1, 2, 2];

		// The BMW spec defines a suite of s_n(x) functions. I implement this as
		// one function s(x, n), with the constants sc[n]. 
		s = function (x, n) {
			return (n < 4) ? 
				rot(x, sc[n]) ^ rot(x, sc[n + 4]) ^ (x << sc[n + 8]) ^ (x >>> sc[n + 12]) :
				x ^ (x >>> n - 3); 
		};
		// In the "folding" step there is a set of erratic, irregular expressions,
		// which can mostly be reduced to a suite of 24 constants:
		fc = [21, 7, 5, 1, 3, 22, 4, 11, 24, 6, 22, 20, 3, 4, 7, 2, 5, 24, 21, 21, 16, 6, 22, 18];
		fold = function (x, n) {
			n = fc[n];
			return (n < 16) ? x >>> n : x << (n - 16);
		};
		// There are also some erratic expansion constants, which are defined here:
		ec_s = [29, 13, 27, 13, 25, 21, 18, 4, 5, 11, 17, 24, 19, 31, 5, 24];
		ec_n = [5, 7, 10, 13, 14];
		ec2_rot = [0, 3, 7, 13, 16, 19, 23, 27];

		// This is the BMW compression function: given a message block m and a  
		// chaining state H, it "expands" the two into the "quad-pipe" Q, and
		// then "folds" the result back into H. 
		compress = function (m, H) {
			var lo, hi, i, j, k, a, b, Q;
			Q = [];
			// first expansion phase: here `a` is W_i as mentioned in the spec.
			for (i = 0; i < 16; i += 1) {
				a = 0; 
				for (j = 0; j < 5; j += 1) {
					k = (i + ec_n[j]) % 16;
					b = H[k] ^ m[k];
					a += (ec_s[i] >> j) % 2 ? b : -b;
				}
				Q[i] = H[(i + 1) % 16] + s(a, i % 5);
			}
			// second expansion phase: two expand1 rounds and 14 expand2 rounds
			for (i = 0; i < 16; i += 1) {
				// both expand1 and expand2 start from this value for Q:
				a = (i + 3) % 16;
				b = (i + 10) % 16;
				Q[i + 16] = H[(i + 7) % 16] ^ (add_const[i] +
					rot(m[i], 1 + i) + 
					rot(m[a], 1 + a) -
					rot(m[b], 1 + b));
				// then they both add in f(Q[i]) for the 16 previous i's. 
				// we start k at 1 to make the indices for both functions go
				// like [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].
				for (k = 1; k < 17; k += 1) {
					// here `a` is the Q[i] to be transformed. We apply either the
					// expand1 functions:
					// [s1, s2, s3, s0, s1, s2, s3, s0, s1, s2, s3, s0, s1, s2, s3, s0]
					// or the expand2 functions:
					// [r0, r3, r0, r7, r0, r13, r0, r16, r0, r19, r0, r23, r0, r27, s4, s5]
					a = Q[i + k - 1];
					Q[i + 16] += (i < 2) ? s(a, k % 4) : // expand1
						(k > 14) ? s(a, k - 11) :        // expand2 s4 and s5
						(k % 2) ? a :                    // expand2 r0
						rot(a, ec2_rot[k / 2]);          // expand2 r**.
				}
			}

			// folding phase. We initialize the lo and hi diffusion variables.
			lo = hi = 0;
			for (i = 16; i < 24; i += 1) {
				lo ^= Q[i];
				hi ^= Q[i + 8];
			}
			hi ^= lo;
			// then we "fold" Q into H.
			for (i = 0; i < 16; i += 1) {
				H[i] = (i < 8) ? 
					(lo ^ Q[i] ^ Q[i + 24]) + (m[i] ^ fold(hi, i) ^ fold(Q[i + 16], i + 16)) : 
					(hi ^ m[i] ^ Q[i + 16]) + (Q[i] ^ fold(lo, i) ^ Q[16 + (i - 1) % 8]) + 
						rot(H[(i - 4) % 8], i + 1);
			}
			return H;
		};

		// The bmw() function.
		return function (msg) {
			var len, i, data, H;
			len = 16 * msg.length;
			msg += "\u0080";
			while (msg.length % 32 !== 28) {
				msg += "\u0000";
			}
			data = [];
			for (i = 0; i < msg.length; i += 2) {
				data.push(msg.charCodeAt(i) + 65536 * msg.charCodeAt(i + 1));
			}
			data.push(len);
			data.push(0);
			H = iv.slice(0);
			for (i = 0; i < data.length; i += 16) {
				compress(data.slice(i, i + 16), H);
			}
			return compress(H, final.slice(0)).slice(8, 16).map(output_fn).join("");
		};
	}()),

	cubehash : (function () {
		var state, round, input, initial_state, out_length, tmp, i, j, r, plus_rotate, swap_xor_swap, hex, output_fn;
		out_length = 256;
		state = [
			out_length / 8, 32, 16, 0, 0, 0, 0, 0,
			0, 0, 0, 0, 0, 0, 0, 0,
			0, 0, 0, 0, 0, 0, 0, 0,
			0, 0, 0, 0, 0, 0, 0, 0
		];

		plus_rotate = function (r, s) {
			for (i = 0; i < 16; i += 1) {
				state[16 + i] += state[i];
				state[i] = (state[i] << r) ^ (state[i] >>> s);
			}
		};

			// swap, xor, and swap steps.
		swap_xor_swap = function (mask1, mask2) {
			for (i = 0; i < 16; i += 1) {
				if (i & mask1) {
					j = i ^ mask1;
					tmp = state[i] ^ state[j + 16];
					state[i] = state[j] ^ state[i + 16];
					state[j] = tmp;
				}
			}
			for (i = 16; i < 32; i += 1) {
				if (i & mask2) {
					j = i ^ mask2;
					tmp = state[i];
					state[i] = state[j];
					state[j] = tmp;
				}
			}
		};
		round = function (n) {
			n *= 16;
			for (r = 0; r < n; r += 1) {
				plus_rotate(7, 25);
				swap_xor_swap(8, 2);
				plus_rotate(11, 21);
				swap_xor_swap(4, 1);
			}
		};
		// we initialize the state and save it.
		round(10);
		initial_state = state.slice(0);

		// output formatting function, giving the little-endian hex display of a number.
		hex = function (n) {
			return ("00" + n.toString(16)).slice(-2);
		};
		output_fn = function (n) {
			return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
		};

		return function (str) {
			var block, i;
			state = initial_state.slice(0);
			str += "\u0080";
			while (str.length % 16 > 0) {
				str += "\u0000";
			}
			input = [];
			for (i = 0; i < str.length; i += 2) {
				input.push(str.charCodeAt(i) + str.charCodeAt(i + 1) * 0x10000);
			}
			for (block = 0; block < input.length; block += 8) {
				for (i = 0; i < 8; i += 1) {
					state[i] ^= input[block + i];
				}
				round(1);
			}
			state[31] ^= 1;
			round(10);
			return state.map(output_fn).join("").substring(0, out_length / 4);
		};
	}()),

	skein : (function () {
		var even, odd, charcode, zero, pad, rot, ubi, initial, state, mix, subkey_inject, L;
		L = function (lo, hi) {
			this.lo = lo ? lo : 0;
			this.hi = hi ? hi : 0;
		};
		L.clone = function (a) {
			return new L(a.lo, a.hi);
		};
		L.prototype = {
			xor: function (that) {
				this.lo ^= that.lo;
				this.hi ^= that.hi;
				return this;
			},
			plus: (function () {
				var two32, s;
				two32 = 4 * (1 << 30);
				s = function (x, y) {
					var t = x + y;
					if (x < 0) {
						t += two32;
					}
					if (y < 0) {
						t += two32;
					}
					return t;
				};
				return function (that) {
					this.lo = s(this.lo, that.lo);
					this.hi = (s(this.hi, that.hi) + (this.lo >= two32 ? 1 : 0)) % two32;
					this.lo = this.lo % two32;
					return this;
				};
			}()),
			circ: function (n) {
				var tmp, m;
				if (n >= 32) {
					tmp = this.lo;
					this.lo = this.hi;
					this.hi = tmp;
					n -= 32;
				} 
				m = 32 - n;
				tmp = (this.hi << n) + (this.lo >>> m);
				this.lo = (this.lo << n) + (this.hi >>> m);
				this.hi = tmp;
				return this;
			},
			toString: (function () {
				var hex, o;
				hex = function (n) {
					return ("00" + n.toString(16)).slice(-2);
				};
				o = function (n) {
					return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
				};
				return function () {
					return o(this.lo) + o(this.hi);
				};
			}())
		};
		//permutation constants
		even = [0, 2, 4, 6, 2, 4, 6, 0, 4, 6, 0, 2, 6, 0, 2, 4];
		odd = [1, 3, 5, 7, 1, 7, 5, 3, 1, 3, 5, 7, 1, 7, 5, 3];
		charcode = String.fromCharCode;
		zero = charcode(0);
		// padding string: 32 zero-characters
		pad = zero + zero + zero + zero;
		pad += pad + pad + pad;
		pad += pad;
		// rotation constants..
		rot = [
			[46, 36, 19, 37, 33, 27, 14, 42, 17, 49, 36, 39, 44, 9, 54, 56], 
			[39, 30, 34, 24, 13, 50, 10, 17, 25, 29, 39, 43, 8, 35, 56, 22]
		];
		subkey_inject = function (key, tweak, round) {
			for (var i = 0; i < 8; i += 1) {
				state[i].plus(key[(round + i) % 9]);
			}
			state[5].plus(tweak[round % 3]);
			state[6].plus(tweak[(round + 1) % 3]);
			state[7].plus(new L(round));
		};
		mix = function (r) {
			// input: one of the two arrays of round constants.
			var a, b, i;
			for (i = 0; i < 16; i += 1) {
				a = even[i];
				b = odd[i];
				state[a].plus(state[b]);
				state[b].circ(r[i]).xor(state[a]);
			}
		};
		// UBI calls on the chaining state c have a type number T (0-63), and some
		// data string D, while c is itself used as a Threefish32 key schedule.
		ubi = function (type, message) {
			var key, data, i, j, block, round, first, last, tweak, original_length;
			// the message is padded with zeroes and turned into 32-bit ints.
			// first we store the original length
			original_length = message.length;
			if (original_length % 32) {
				message += pad.slice(original_length % 32);
			} else if (original_length === 0) {
				message = pad;
			}
			// then we construct the data array.
			data = [];
			j = 0;
			for (i = 0; i < message.length; i += 4) {
				data[j] = new L(
					message.charCodeAt(i) + message.charCodeAt(i + 1) * 0x10000,
					message.charCodeAt(i + 2) + message.charCodeAt(i + 3) * 0x10000
				);
				j += 1;
			}
			// we want a pointer last block, and tweak flags for first and type.
			first = 1 << 30;
			type <<= 24;
			last = data.length - 8;
			for (block = 0; block <= last; block += 8) {
				// tweak field. we're processing ints (block -> block + 8),
				// which each take up four bytes. On the last block we don't count
				// the padding 0's and we raise a "last" flag.
				tweak = (block === last) ? 
					[new L(2 * original_length), new L(0, first + type + (1 << 31))] :
					[new L(8 * block + 64), new L(0, first + type)];
				// extended tweak field.
				tweak[2] = new L().xor(tweak[0]).xor(tweak[1]);

				// the key for threefish encryption is extended from the chaining state
				// with one extra value.
				key = state;
				key[8] = new L(0xa9fc1a22, 0x1bd11bda);
				for (i = 0; i < 8; i += 1) {
					key[8].xor(key[i]);
				}
				// and the state now gets the plaintext for this UBI iteration.
				state = data.slice(block, block + 8).map(L.clone);

				// Each "mix" is four "rounds" of threefish32, so the 18 here 
				// is essentially 4*18 = 72 in the spec.
				for (round = 0; round < 18; round += 1) {
					subkey_inject(key, tweak, round);
					mix(rot[round % 2]);
				}
				// there is then one final subkey addition in Threefish32:
				subkey_inject(key, tweak, round);
				// now we pass on to Matyas-Meyer-Oseas, XORing the source data
				// into the current state vector.
				for (i = 0; i < 8; i += 1) {
					state[i].xor(data[block + i]);
				}
				first = 0;
			}
		};
		state = [new L(), new L(), new L(), new L(), new L(), new L(), new L(), new L()];

		// ubi(0, "key string")
		ubi(4, charcode(0x4853, 0x3341, 1, 0, 512) + pad.slice(5, 16));
		// ubi(8, "personalization as UTF-16, against the standard.");
		// ubi(12, "public key string, if such exists.");
		// ubi(16, "key identifier");
		// ubi(20, "nonce input");
		initial = state;
		return function (m) {
			state = initial.map(L.clone);
			ubi(48, m);
			ubi(63, zero + zero + zero + zero);
			return state.join("");
		};
	}()),

	halfskein : (function () {
		var even, odd, charcode, zero, pad, rot, ubi, initial, state, mix, hex, output_fn, subkey_inject;
		//permutation constants
		even = [0, 2, 4, 6, 2, 4, 6, 0, 4, 6, 0, 2, 6, 0, 2, 4];
		odd = [1, 3, 5, 7, 1, 7, 5, 3, 1, 3, 5, 7, 1, 7, 5, 3];
		charcode = String.fromCharCode;
		zero = charcode(0);
		// padding string: sixteen zero-characters
		pad = zero + zero + zero + zero;
		pad += pad + pad + pad;

		// rotation constants: f([3, 14, 15, 92, 65, 35...]).
		rot = [
			[5, 16, 17, 10, 11, 9, 7, 25, 6, 12, 20, 28, 17, 12, 6, 25], 
			[24, 2, 2, 21, 17, 15, 13, 11, 21, 12, 4, 22, 15, 23, 18, 5]
		];
		subkey_inject = function (key, tweak, round) {
			for (var i = 0; i < 8; i += 1) {
				state[i] += key[(round + i) % 9];
			}
			state[5] += tweak[round % 5];
			state[6] += tweak[(round + 1) % 5];
			state[7] += round;
		};
		mix = function (r) {
			// input: one of the two arrays of round constants.
			var a, b, i;
			for (i = 0; i < 16; i += 1) {
				a = even[i];
				b = odd[i];
				state[a] += state[b];
				state[b] = state[a] ^ (state[b] << r[i] | state[b] >>> 32 - r[i]);
			}
		};

		// UBI calls on the chaining state c have a type number T (0-63), and some
		// data string D, while c is itself used as a Threefish32 key schedule.
		ubi = function (type, message) {
			var key, data, i, j, block, round, first, last, tweak, original_length;
			// the message is padded with zeroes and turned into 32-bit ints.
			// first we store the original length
			original_length = message.length;
			if (original_length % 16) {
				message += pad.slice(original_length % 16);
			} else if (original_length === 0) {
				message = pad;
			}
			// then we construct the data array.
			data = [];
			j = 0;
			for (i = 0; i < message.length; i += 2) {
				data[j] = message.charCodeAt(i) + message.charCodeAt(i + 1) * 0x10000;
				j += 1;
			}
			// we want a pointer last block, and tweak flags for first and type.
			first = 1 << 30;
			type <<= 24;
			last = data.length - 8;
			for (block = 0; block <= last; block += 8) {
				// tweak field. we're processing ints (block -> block + 8),
				// which each take up four bytes. On the last block we don't count
				// the padding 0's and we raise a "last" flag.
				tweak = (block === last) ? 
					[2 * original_length, 0, 0, first + type + (1 << 31)] :
					[4 * block + 32, 0, 0, first + type];
				// extended tweak field.
				tweak[4] = tweak[0] ^ tweak[3];

				// the key for threefish encryption is extended from the chaining state
				// with one extra value.
				key = state;
				key[8] = 0x55555555;
				for (i = 0; i < 8; i += 1) {
					key[8] ^= key[i];
				}
				// and the state now gets the plaintext for this UBI iteration.
				state = data.slice(block, block + 8);

				// Each "mix" is four "rounds" of threefish32, so the 18 here 
				// is essentially 4*18 = 72 in the spec.
				for (round = 0; round < 18; round += 1) {
					subkey_inject(key, tweak, round);
					mix(rot[round % 2]);
				}
				// there is then one final subkey addition in Threefish32:
				subkey_inject(key, tweak, round);
				// now we pass on to Matyas-Meyer-Oseas, XORing the source data
				// into the current state vector.
				for (i = 0; i < 8; i += 1) {
					state[i] ^= data[block + i];
				}
				first = 0;
			}
		};
		// output formatting function, giving the little-endian hex display of a number.
		hex = function (n) {
			return ("00" + n.toString(16)).slice(-2);
		};
		output_fn = function (n) {
			return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
		};
		state = [0, 0, 0, 0, 0, 0, 0, 0];

		// below, the config block should be ASCII bytes for "SHA3", but it has 
		// intentionally been left as ASCII bytes for "hSkn" instead.

		// different options for configuration:
		// ubi(0, "key string")
		ubi(4, charcode(0x5368, 0x6e6b, 1, 0, 256) + pad.slice(5));
		// ubi(8, "personalization as UTF-16, against the standard.");
		// ubi(12, "public key string, if such exists.");
		// ubi(16, "key identifier");
		// ubi(20, "nonce input");
		initial = state;
		return function (m) {
			state = initial.slice(0);
			ubi(48, m);
			ubi(63, zero + zero + zero + zero);
			return state.map(output_fn).join("");
		};
	}()),

	shabal : (function () {
		var A, B, C, M, circ, shabal_f, ivA, ivB, ivC, z, hex, output_fn;
		circ = function (x, n) {
			return (x << n) + (x >>> (32 - n));
		};
		hex = function (n) {
			return ("00" + n.toString(16)).slice(-2);
		};
		output_fn = function (n) {
			return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
		};
		shabal_f = function (start, w0, w1) {
			var i, j, k;
			for (i = 0; i < 16; i += 1) {
				B[i] = circ(B[i] + M[start + i], 17);
			}
			A[0] ^= w0;
			A[1] ^= w1;
			for (j = 0; j < 3; j += 1) {
				for (i = 0; i < 16; i += 1) {
					k = (i + 16 * j) % 12;
					A[k] = 3 * (A[k] ^ 5 * circ(A[(k + 11) % 12], 15) ^ C[(24 - i) % 16]) ^
						B[(i + 13) % 16] ^ (B[(i + 9) % 16] & ~ B[(i + 6) % 16]) ^ M[start + i];
					B[i] = circ(B[i], 1) ^ ~ A[k];
				}
			}
			for (j = 0; j < 36; j += 1) {
				A[j % 12] += C[(j + 3) % 16];
			}
			for (i = 0; i < 16; i += 1) {
				C[i] -= M[start + i];
			}
			k = B; 
			B = C; 
			C = k;
		};
		B = []; 
		C = [];
		M = [];
		for (z = 0; z < 16; z += 1) {
			B[z] = C[z] = 0;
			M[z] = 256 + z;
			M[z + 16] = 272 + z;
		}
		A = B.slice(4);
		shabal_f(0, -1, -1);
		shabal_f(16, 0, 0);
		ivA = A;
		ivB = B;
		ivC = C;
		return function (msg) {
			var i, j = 0;
			// clone the IV.
			A = ivA.slice(0);
			B = ivB.slice(0);
			C = ivC.slice(0);
			// pad the message with a byte 0x80 and then bytes 0x00 until you have
			// an integer number of 512-bit blocks.
			msg += "\u0080";
			while (msg.length % 32) {
				msg += "\u0000";
			}
			// then push them into the M array as 
			M = [];
			for (i = 0; i < msg.length; i += 2) {
				M.push(msg.charCodeAt(i) + 65536 * msg.charCodeAt(i + 1));
			}
			for (i = 0; i < M.length; i += 16) {
				j += 1;
				shabal_f(i, j, 0);
			}
			i -= 16;
			shabal_f(i, j, 0);
			shabal_f(i, j, 0);
			shabal_f(i, j, 0);
			return C.slice(8, 16).map(output_fn).join("");
		};
	}()),

	keccak : (function () {
		var state, State, L, permute, zeros, RC, r, keccak_f;
		L = function (lo, hi) {
			this.lo = lo ? lo : 0;
			this.hi = hi ? hi : 0;
		};
		L.clone = function (a) {
			return new L(a.lo, a.hi);
		};
		L.prototype = {
			xor: function (that) {
				this.lo ^= that.lo;
				this.hi ^= that.hi;
				return this;
			},
			not: function () {
				return new L(~this.lo, ~this.hi);
			},
			and: function (that) {
				this.lo &= that.lo;
				this.hi &= that.hi;
				return this;
			},
			circ: function (n) {
				var tmp, m;
				if (n >= 32) {
					tmp = this.lo;
					this.lo = this.hi;
					this.hi = tmp;
					n -= 32;
				}
				if (n === 0) {
					return this;
				}
				m = 32 - n;
				tmp = (this.hi << n) + (this.lo >>> m);
				this.lo = (this.lo << n) + (this.hi >>> m);
				this.hi = tmp;
				return this;
			},
			toString: (function () {
				var hex, o;
				hex = function (n) {
					return ("00" + n.toString(16)).slice(-2);
				};
				o = function (n) {
					return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
				};
				return function () {
					return o(this.lo) + o(this.hi);
				};
			}())
		};
		zeros = function (k) {
			var i, z = [];
			for (i = 0; i < k; i += 1) {
				z[i] = new L();
			}
			return z;
		};
		State = function (s) {
			var fn = function (x, y) {
				return fn.array[(x % 5) + 5 * (y % 5)];
			};
			fn.array = s ? s : zeros(25);
			fn.clone = function () {
				return new State(fn.array.map(L.clone));
			};
			return fn;
		};

		permute = [0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4];
		RC = "0,1;0,8082;z,808A;z,yy;0,808B;0,y0001;z,y8081;z,8009;0,8A;0,88;0,y8009;0,y000A;0,y808B;z,8B;z,8089;z,8003;z,8002;z,80;0,800A;z,y000A;z,y8081;z,8080;0,y0001;z,y8008"
			.replace(/z/g, "80000000").replace(/y/g, "8000").split(";").map(function (str) {
				var k = str.split(",");
				return new L(parseInt(k[1], 16), parseInt(k[0], 16));
			});
		r = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
		keccak_f = function () {
			var x, y, i, b, C, D, round, last;
			for (round = 0; round < 24; round += 1) {
				// THETA STEP
				C = zeros(5);
				for (x = 0; x < 5; x += 1) {
					for (y = 0; y < 5; y += 1) {
						C[x].xor(state(x, y));
					}
				}
				// Extra logic needed because L() objects are dynamic.
				// D[x] = C[x + 1]
				D = C.map(L.clone);
				D = D.concat(D.splice(0, 1));
				// D[x] = C[x - 1] xor rot(C[x+1], 1)
				for (x = 0; x < 5; x += 1) {
					D[x].circ(1).xor(C[(x + 4) % 5]);
				}
				for (x = 0; x < 5; x += 1) {
					for (y = 0; y < 5; y += 1) {
						state(x, y).xor(D[x]);
					}
				}
				// RHO STEP
				for (x = 0; x < 5; x += 1) {
					for (y = 0; y < 5; y += 1) {
						state(x, y).circ(r[5 * y + x]);
					}
				}
				// PI STEP
				last = state.array.slice(0);
				for (i = 0; i < 25; i += 1) {
					state.array[permute[i]] = last[i];
				}

				// CHI STEP
				b = state.clone();
				for (x = 0; x < 5; x += 1) {
					for (y = 0; y < 5; y += 1) {
						state(x, y).xor(b(x + 1, y).not().and(b(x + 2, y)));
					}
				}
				// IOTA STEP
				state(0, 0).xor(RC[round]);
			}
		};
		return function (m) {
			state = new State();
			m += "\u2001\u0188";
			while (m.length % 68 !== 0) {
				m += "\u0000";
			}
			var b, k;
			for (b = 0; b < m.length; b += 68) {
				for (k = 0; k < 68; k += 4) {
					state.array[k / 4].xor(
						new L(m.charCodeAt(b + k) + m.charCodeAt(b + k + 1) * 65536,
							m.charCodeAt(b + k + 2) +  m.charCodeAt(b + k + 3) * 65536)
					);
				}
				keccak_f();
			}
			return state.array.slice(0, 4).join("");
		};
	}())
};
}());
});
