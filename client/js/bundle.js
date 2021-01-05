(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var $ = require('jquery');

var InfoMessageManager = function (el, params) {
    this.initialised = false;
};

InfoMessageManager.prototype.init = function () {
    this.$container = $(document.createElement("div"));
    this.$container.addClass("alert");
    this.$container
        .css("position", "fixed")
        .css("left", "50%")
        .css("transform", "translateX(-50%)")
        .css("bottom", "20px");
    this.$container.hide();
    $("body").append(this.$container);

    this.currentTimeout = -1;
    this.initialised = true;
};

InfoMessageManager.prototype.showSuccess = function (msg) {
    if (!this.initialised) this.init();
    this.$container.addClass("alert-success").removeClass("alert-danger");
    this.post(msg);
};

InfoMessageManager.prototype.showError = function (msg) {
    if (!this.initialised) this.init();
    this.$container.addClass("alert-danger").removeClass("alert-success");

    this.post(msg);
};

InfoMessageManager.prototype.handleSuccessfulAjax = function(res) {
    this.showSuccess(res.message);
};

InfoMessageManager.prototype.handleFailedAjax = function(res) {
    console.error(res);

    var msg = "genericError";
    if (res.responseText) {
        try {
            var parsed = JSON.parse(res.responseText);
            msg = parsed.message;
        } catch (e) {
            // no json, just show general message
        }
    }
    this.showError(msg);
};

InfoMessageManager.prototype.post = function (msg) {
    if (!this.initialised) this.init();
    this.$container.text((window.lang && window.lang[msg]) ?? msg);
    this.$container.show();

    if (this.currentTimeout !== -1) {
        clearTimeout(this.currentTimeout)
    }

    this.currentTimeout = setTimeout(function () {
        this.$container.hide();
        this.currentTimeout = -1;
    }.bind(this), 4000);
};


module.exports = new InfoMessageManager();

},{"jquery":3}],2:[function(require,module,exports){
$ = jQuery = require('jquery');
var Twig = require('twig');
var templatePrepare = require("./templates/prepare")
var templateRoundRunning = require("./templates/round-running")
var templateGuessersFakers = require("./templates/guessers-fakers")
var templateRevelation = require("./templates/revelation")
var infoMessageManager = require("./InfoMessageManager")

$(document).ready(function () {
    if (!("WebSocket" in window)) {
        $('<p>Oh no, you need a browser that supports WebSockets. How about <a href="https://www.mozilla.org/de/firefox/new/">Firefox</a>?</p>').appendTo('#container');
        return;
    }

    //The user has WebSockets, yaaaay
    var socket;
    var host = "ws://" + serverUrl + ":" + serverPort;
    var reconnect = true;

    var gameId = $("body").attr("data-game");
    var gameJson = {}
    var userState = localStorage.getItem("userState");
    userState = userState ? JSON.parse(userState) : {};

    function wsconnect() {
        try {
            socket = new WebSocket(host);
            socket.onopen = function () {
                status('[Socket Status]: ' + socket.readyState + ' (open)');

                if (userState[gameId] && userState[gameId].role) {
                    var userStateCopy = JSON.parse(JSON.stringify(userState[gameId]));

                    if (userState[gameId].role === "faker") {
                        userStateCopy.action = "joinFakers";
                    }

                    if (userState[gameId].role === "guesser") {
                        userStateCopy.action = "joinGuessers";
                    }
                    send(userStateCopy);
                } else {
                    requestStatus();
                }
            };

            socket.onerror = function (error) {
                status('[Socket Status]: ' + socket.readyState + ' (' + error + ')');
            };

            //receive message
            socket.onmessage = function (msg) {
                var data = JSON.parse(msg.data);
                status("[Incoming]: " + msg.data);

                switch (data.action) {
                    case "warning":
                        infoMessageManager.showError(data.message);
                        break;

                    case "userState":
                        userState = localStorage.getItem("userState");
                        userState = userState ? JSON.parse(userState) : {};
                        data.word = $(".js-word").val();
                        userState[data.game] = data;
                        localStorage.setItem("userState", JSON.stringify(userState));
                        break;

                    case "update":
                        data.address = $("body").attr("data-address")
                        data.lang = window.lang;
                        var gameIsInPhase1 = data.state === 'prepare';
                        var gameWasInPhase1 = gameJson.state === 'prepare';

                        if (gameIsInPhase1 && !gameWasInPhase1) {
                            $("#container").html(templatePrepare.render(data));
                            if (userState[gameId]) {
                                $(".js-name").val(userState[gameId].name);
                                $(".js-word").val(userState[gameId].word);
                            }
                        } else if (gameIsInPhase1 && gameWasInPhase1) {
                            $("#guesser-faker-container").html(templateGuessersFakers.render(data));
                        } else if (data.state === 'guessing') {
                            $("#container").html(templateRoundRunning.render(data));
                        } else if (data.state === 'revelation') {
                            $("#container").html(templateRevelation.render(data));
                        }
                        gameJson = data;
                        break;

                }
            };

            socket.onclose = function (e) {
                if (reconnect) {
                    wsconnect();
                }
                status('[Socket Status]: ' + socket.readyState + ' (Closed)');
            }

        } catch
            (exception) {
            message('<p>Error' + exception);
        }
    }

    function send(text) {
        try {
            if (typeof (text) === 'object') text = JSON.stringify(text)
            socket.send(text);
            status('[Outgoing]: ' + text)
        } catch (exception) {
            status('[Error]: ', exception);
        }
    }


    function status(msg, err) {
        if (err) console.log(msg, err); else console.log(msg);
    }

    var requestStatus = function () {
        send({
            "action": "status",
            "game": gameId
        });
    }

    var sendName = function (name) {
        if (!userState[gameId] || !userState[gameId].role) return
        send({
            "action": "setName",
            "name": name
        });
        userState[gameId].name = name;
        localStorage.setItem("userState", JSON.stringify(userState));
    };

    var sendWord = function (word) {
        if (!userState[gameId] || !userState[gameId].role) return
        send({
            "action": "setWord",
            "word": word
        });
        userState[gameId].word = word;
        localStorage.setItem("userState", JSON.stringify(userState));
    };


    $(document).on("blur", ".js-name", function (e) {
        e.preventDefault();
        var name = $(e.target).val();
        localStorage.setItem("name", name);
        sendName(name);
    });

    $(document).on("blur", ".js-word", function (e) {
        e.preventDefault();
        var word = $(e.target).val();
        localStorage.setItem("word", word);
        sendWord(word);
    });

    $(document).on("click", ".js-join-fakers", function (e) {
        e.preventDefault();
        send({
            "action": "joinFakers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val(),
            "word": $(".js-word").val()
        });
    });

    $(document).on("click", ".js-join-guessers", function (e) {
        e.preventDefault();
        send({
            "action": "joinGuessers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val()
        });
    });

    $(document).on("click", ".js-start-round", function (e) {
        e.preventDefault();
        send({
            "action": "startRound"
        });
    });

    $(document).on("click", ".js-finish-voting", function (e) {
        e.preventDefault();
        send({
            "action": "finishVoting"
        });
    });

    $(document).on("click", ".js-restart", function (e) {
        e.preventDefault();
        send({
            "action": "restart"
        });
    });

    $(document).on("click", ".js-share", function (e) {
        var input = $(e.target);
        input.select();
        document.execCommand("copy");
        infoMessageManager.showSuccess("copiedToClipboard");
    });

    $(document).on("click", ".js-faker", function (e) {
        var $item = $(e.target);
        var vote = $item.attr("data-id");
        send({
            "action": "vote",
            "vote": vote
        });
    });

    wsconnect();
//End connect()

});

},{"./InfoMessageManager":1,"./templates/guessers-fakers":5,"./templates/prepare":6,"./templates/revelation":7,"./templates/round-running":8,"jquery":3,"twig":4}],3:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v3.5.1
 * https://jquery.com/
 *
 * Includes Sizzle.js
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2020-05-04T22:49Z
 */
( function( global, factory ) {

	"use strict";

	if ( typeof module === "object" && typeof module.exports === "object" ) {

		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
} )( typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Edge <= 12 - 13+, Firefox <=18 - 45+, IE 10 - 11, Safari 5.1 - 9+, iOS 6 - 9.1
// throw exceptions when non-strict code (e.g., ASP.NET 4.5) accesses strict mode
// arguments.callee.caller (trac-13335). But as of jQuery 3.0 (2016), strict mode should be common
// enough that all such attempts are guarded in a try block.
"use strict";

var arr = [];

var getProto = Object.getPrototypeOf;

var slice = arr.slice;

var flat = arr.flat ? function( array ) {
	return arr.flat.call( array );
} : function( array ) {
	return arr.concat.apply( [], array );
};


var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var fnToString = hasOwn.toString;

var ObjectFunctionString = fnToString.call( Object );

var support = {};

var isFunction = function isFunction( obj ) {

      // Support: Chrome <=57, Firefox <=52
      // In some browsers, typeof returns "function" for HTML <object> elements
      // (i.e., `typeof document.createElement( "object" ) === "function"`).
      // We don't want to classify *any* DOM node as a function.
      return typeof obj === "function" && typeof obj.nodeType !== "number";
  };


var isWindow = function isWindow( obj ) {
		return obj != null && obj === obj.window;
	};


var document = window.document;



	var preservedScriptAttributes = {
		type: true,
		src: true,
		nonce: true,
		noModule: true
	};

	function DOMEval( code, node, doc ) {
		doc = doc || document;

		var i, val,
			script = doc.createElement( "script" );

		script.text = code;
		if ( node ) {
			for ( i in preservedScriptAttributes ) {

				// Support: Firefox 64+, Edge 18+
				// Some browsers don't support the "nonce" property on scripts.
				// On the other hand, just using `getAttribute` is not enough as
				// the `nonce` attribute is reset to an empty string whenever it
				// becomes browsing-context connected.
				// See https://github.com/whatwg/html/issues/2369
				// See https://html.spec.whatwg.org/#nonce-attributes
				// The `node.getAttribute` check was added for the sake of
				// `jQuery.globalEval` so that it can fake a nonce-containing node
				// via an object.
				val = node[ i ] || node.getAttribute && node.getAttribute( i );
				if ( val ) {
					script.setAttribute( i, val );
				}
			}
		}
		doc.head.appendChild( script ).parentNode.removeChild( script );
	}


function toType( obj ) {
	if ( obj == null ) {
		return obj + "";
	}

	// Support: Android <=2.3 only (functionish RegExp)
	return typeof obj === "object" || typeof obj === "function" ?
		class2type[ toString.call( obj ) ] || "object" :
		typeof obj;
}
/* global Symbol */
// Defining this global in .eslintrc.json would create a danger of using the global
// unguarded in another place, it seems safer to define global only for this module



var
	version = "3.5.1",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {

		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	};

jQuery.fn = jQuery.prototype = {

	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {

		// Return all the elements in a clean array
		if ( num == null ) {
			return slice.call( this );
		}

		// Return just the one element from the set
		return num < 0 ? this[ num + this.length ] : this[ num ];
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	each: function( callback ) {
		return jQuery.each( this, callback );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map( this, function( elem, i ) {
			return callback.call( elem, i, elem );
		} ) );
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	even: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return ( i + 1 ) % 2;
		} ) );
	},

	odd: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return i % 2;
		} ) );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor();
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[ 0 ] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !isFunction( target ) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {

		// Only deal with non-null/undefined values
		if ( ( options = arguments[ i ] ) != null ) {

			// Extend the base object
			for ( name in options ) {
				copy = options[ name ];

				// Prevent Object.prototype pollution
				// Prevent never-ending loop
				if ( name === "__proto__" || target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
					( copyIsArray = Array.isArray( copy ) ) ) ) {
					src = target[ name ];

					// Ensure proper type for the source value
					if ( copyIsArray && !Array.isArray( src ) ) {
						clone = [];
					} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
						clone = {};
					} else {
						clone = src;
					}
					copyIsArray = false;

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend( {

	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isPlainObject: function( obj ) {
		var proto, Ctor;

		// Detect obvious negatives
		// Use toString instead of jQuery.type to catch host objects
		if ( !obj || toString.call( obj ) !== "[object Object]" ) {
			return false;
		}

		proto = getProto( obj );

		// Objects with no prototype (e.g., `Object.create( null )`) are plain
		if ( !proto ) {
			return true;
		}

		// Objects with prototype are plain iff they were constructed by a global Object function
		Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
		return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
	},

	isEmptyObject: function( obj ) {
		var name;

		for ( name in obj ) {
			return false;
		}
		return true;
	},

	// Evaluates a script in a provided context; falls back to the global one
	// if not specified.
	globalEval: function( code, options, doc ) {
		DOMEval( code, { nonce: options && options.nonce }, doc );
	},

	each: function( obj, callback ) {
		var length, i = 0;

		if ( isArrayLike( obj ) ) {
			length = obj.length;
			for ( ; i < length; i++ ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		} else {
			for ( i in obj ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		}

		return obj;
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArrayLike( Object( arr ) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	// Support: Android <=4.0 only, PhantomJS 1 only
	// push.apply(_, arraylike) throws on ancient WebKit
	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var length, value,
			i = 0,
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArrayLike( elems ) ) {
			length = elems.length;
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return flat( ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
} );

if ( typeof Symbol === "function" ) {
	jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
}

// Populate the class2type map
jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
function( _i, name ) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
} );

function isArrayLike( obj ) {

	// Support: real iOS 8.2 only (not reproducible in simulator)
	// `in` check used to prevent JIT error (gh-2145)
	// hasOwn isn't used here due to false negatives
	// regarding Nodelist length in IE
	var length = !!obj && "length" in obj && obj.length,
		type = toType( obj );

	if ( isFunction( obj ) || isWindow( obj ) ) {
		return false;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.3.5
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://js.foundation/
 *
 * Date: 2020-03-14
 */
( function( window ) {
var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	nonnativeSelectorCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// Instance methods
	hasOwn = ( {} ).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	pushNative = arr.push,
	push = arr.push,
	slice = arr.slice,

	// Use a stripped-down indexOf as it's faster than native
	// https://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[ i ] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|" +
		"ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",

	// https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
	identifier = "(?:\\\\[\\da-fA-F]{1,6}" + whitespace +
		"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +

		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +

		// "Attribute values must be CSS identifiers [capture 5]
		// or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" +
		whitespace + "*\\]",

	pseudos = ":(" + identifier + ")(?:\\((" +

		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +

		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +

		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" +
		whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace +
		"*" ),
	rdescend = new RegExp( whitespace + "|>" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + identifier + ")" ),
		"CLASS": new RegExp( "^\\.(" + identifier + ")" ),
		"TAG": new RegExp( "^(" + identifier + "|[*])" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
			whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" +
			whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),

		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace +
			"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
			"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rhtml = /HTML$/i,
	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,

	// CSS escapes
	// http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\[\\da-fA-F]{1,6}" + whitespace + "?|\\\\([^\\r\\n\\f])", "g" ),
	funescape = function( escape, nonHex ) {
		var high = "0x" + escape.slice( 1 ) - 0x10000;

		return nonHex ?

			// Strip the backslash prefix from a non-hex escape sequence
			nonHex :

			// Replace a hexadecimal escape sequence with the encoded Unicode code point
			// Support: IE <=11+
			// For values outside the Basic Multilingual Plane (BMP), manually construct a
			// surrogate pair
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// CSS string/identifier serialization
	// https://drafts.csswg.org/cssom/#common-serializing-idioms
	rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
	fcssescape = function( ch, asCodePoint ) {
		if ( asCodePoint ) {

			// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
			if ( ch === "\0" ) {
				return "\uFFFD";
			}

			// Control characters and (dependent upon position) numbers get escaped as code points
			return ch.slice( 0, -1 ) + "\\" +
				ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
		}

		// Other potentially-special ASCII characters get backslash-escaped
		return "\\" + ch;
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	},

	inDisabledFieldset = addCombinator(
		function( elem ) {
			return elem.disabled === true && elem.nodeName.toLowerCase() === "fieldset";
		},
		{ dir: "parentNode", next: "legend" }
	);

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		( arr = slice.call( preferredDoc.childNodes ) ),
		preferredDoc.childNodes
	);

	// Support: Android<4.0
	// Detect silently failing push.apply
	// eslint-disable-next-line no-unused-expressions
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			pushNative.apply( target, slice.call( els ) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;

			// Can't trust NodeList.length
			while ( ( target[ j++ ] = els[ i++ ] ) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var m, i, elem, nid, match, groups, newSelector,
		newContext = context && context.ownerDocument,

		// nodeType defaults to 9, since context defaults to document
		nodeType = context ? context.nodeType : 9;

	results = results || [];

	// Return early from calls with invalid selector or context
	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	// Try to shortcut find operations (as opposed to filters) in HTML documents
	if ( !seed ) {
		setDocument( context );
		context = context || document;

		if ( documentIsHTML ) {

			// If the selector is sufficiently simple, try using a "get*By*" DOM method
			// (excepting DocumentFragment context, where the methods don't exist)
			if ( nodeType !== 11 && ( match = rquickExpr.exec( selector ) ) ) {

				// ID selector
				if ( ( m = match[ 1 ] ) ) {

					// Document context
					if ( nodeType === 9 ) {
						if ( ( elem = context.getElementById( m ) ) ) {

							// Support: IE, Opera, Webkit
							// TODO: identify versions
							// getElementById can match elements by name instead of ID
							if ( elem.id === m ) {
								results.push( elem );
								return results;
							}
						} else {
							return results;
						}

					// Element context
					} else {

						// Support: IE, Opera, Webkit
						// TODO: identify versions
						// getElementById can match elements by name instead of ID
						if ( newContext && ( elem = newContext.getElementById( m ) ) &&
							contains( context, elem ) &&
							elem.id === m ) {

							results.push( elem );
							return results;
						}
					}

				// Type selector
				} else if ( match[ 2 ] ) {
					push.apply( results, context.getElementsByTagName( selector ) );
					return results;

				// Class selector
				} else if ( ( m = match[ 3 ] ) && support.getElementsByClassName &&
					context.getElementsByClassName ) {

					push.apply( results, context.getElementsByClassName( m ) );
					return results;
				}
			}

			// Take advantage of querySelectorAll
			if ( support.qsa &&
				!nonnativeSelectorCache[ selector + " " ] &&
				( !rbuggyQSA || !rbuggyQSA.test( selector ) ) &&

				// Support: IE 8 only
				// Exclude object elements
				( nodeType !== 1 || context.nodeName.toLowerCase() !== "object" ) ) {

				newSelector = selector;
				newContext = context;

				// qSA considers elements outside a scoping root when evaluating child or
				// descendant combinators, which is not what we want.
				// In such cases, we work around the behavior by prefixing every selector in the
				// list with an ID selector referencing the scope context.
				// The technique has to be used as well when a leading combinator is used
				// as such selectors are not recognized by querySelectorAll.
				// Thanks to Andrew Dupont for this technique.
				if ( nodeType === 1 &&
					( rdescend.test( selector ) || rcombinators.test( selector ) ) ) {

					// Expand context for sibling selectors
					newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
						context;

					// We can use :scope instead of the ID hack if the browser
					// supports it & if we're not changing the context.
					if ( newContext !== context || !support.scope ) {

						// Capture the context ID, setting it first if necessary
						if ( ( nid = context.getAttribute( "id" ) ) ) {
							nid = nid.replace( rcssescape, fcssescape );
						} else {
							context.setAttribute( "id", ( nid = expando ) );
						}
					}

					// Prefix every selector in the list
					groups = tokenize( selector );
					i = groups.length;
					while ( i-- ) {
						groups[ i ] = ( nid ? "#" + nid : ":scope" ) + " " +
							toSelector( groups[ i ] );
					}
					newSelector = groups.join( "," );
				}

				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch ( qsaError ) {
					nonnativeSelectorCache( selector, true );
				} finally {
					if ( nid === expando ) {
						context.removeAttribute( "id" );
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {function(string, object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {

		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {

			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return ( cache[ key + " " ] = value );
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created element and returns a boolean result
 */
function assert( fn ) {
	var el = document.createElement( "fieldset" );

	try {
		return !!fn( el );
	} catch ( e ) {
		return false;
	} finally {

		// Remove from its parent by default
		if ( el.parentNode ) {
			el.parentNode.removeChild( el );
		}

		// release memory in IE
		el = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split( "|" ),
		i = arr.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[ i ] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			a.sourceIndex - b.sourceIndex;

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( ( cur = cur.nextSibling ) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return ( name === "input" || name === "button" ) && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for :enabled/:disabled
 * @param {Boolean} disabled true for :disabled; false for :enabled
 */
function createDisabledPseudo( disabled ) {

	// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
	return function( elem ) {

		// Only certain elements can match :enabled or :disabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
		if ( "form" in elem ) {

			// Check for inherited disabledness on relevant non-disabled elements:
			// * listed form-associated elements in a disabled fieldset
			//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
			// * option elements in a disabled optgroup
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
			// All such elements have a "form" property.
			if ( elem.parentNode && elem.disabled === false ) {

				// Option elements defer to a parent optgroup if present
				if ( "label" in elem ) {
					if ( "label" in elem.parentNode ) {
						return elem.parentNode.disabled === disabled;
					} else {
						return elem.disabled === disabled;
					}
				}

				// Support: IE 6 - 11
				// Use the isDisabled shortcut property to check for disabled fieldset ancestors
				return elem.isDisabled === disabled ||

					// Where there is no isDisabled, check manually
					/* jshint -W018 */
					elem.isDisabled !== !disabled &&
					inDisabledFieldset( elem ) === disabled;
			}

			return elem.disabled === disabled;

		// Try to winnow out elements that can't be disabled before trusting the disabled property.
		// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
		// even exist on them, let alone have a boolean value.
		} else if ( "label" in elem ) {
			return elem.disabled === disabled;
		}

		// Remaining elements are neither :enabled nor :disabled
		return false;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction( function( argument ) {
		argument = +argument;
		return markFunction( function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ ( j = matchIndexes[ i ] ) ] ) {
					seed[ j ] = !( matches[ j ] = seed[ j ] );
				}
			}
		} );
	} );
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	var namespace = elem.namespaceURI,
		docElem = ( elem.ownerDocument || elem ).documentElement;

	// Support: IE <=8
	// Assume HTML when documentElement doesn't yet exist, such as inside loading iframes
	// https://bugs.jquery.com/ticket/4833
	return !rhtml.test( namespace || docElem && docElem.nodeName || "HTML" );
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, subWindow,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// Return early if doc is invalid or already selected
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( doc == document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Update global variables
	document = doc;
	docElem = document.documentElement;
	documentIsHTML = !isXML( document );

	// Support: IE 9 - 11+, Edge 12 - 18+
	// Accessing iframe documents after unload throws "permission denied" errors (jQuery #13936)
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( preferredDoc != document &&
		( subWindow = document.defaultView ) && subWindow.top !== subWindow ) {

		// Support: IE 11, Edge
		if ( subWindow.addEventListener ) {
			subWindow.addEventListener( "unload", unloadHandler, false );

		// Support: IE 9 - 10 only
		} else if ( subWindow.attachEvent ) {
			subWindow.attachEvent( "onunload", unloadHandler );
		}
	}

	// Support: IE 8 - 11+, Edge 12 - 18+, Chrome <=16 - 25 only, Firefox <=3.6 - 31 only,
	// Safari 4 - 5 only, Opera <=11.6 - 12.x only
	// IE/Edge & older browsers don't support the :scope pseudo-class.
	// Support: Safari 6.0 only
	// Safari 6.0 supports :scope but it's an alias of :root there.
	support.scope = assert( function( el ) {
		docElem.appendChild( el ).appendChild( document.createElement( "div" ) );
		return typeof el.querySelectorAll !== "undefined" &&
			!el.querySelectorAll( ":scope fieldset div" ).length;
	} );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert( function( el ) {
		el.className = "i";
		return !el.getAttribute( "className" );
	} );

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert( function( el ) {
		el.appendChild( document.createComment( "" ) );
		return !el.getElementsByTagName( "*" ).length;
	} );

	// Support: IE<9
	support.getElementsByClassName = rnative.test( document.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programmatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert( function( el ) {
		docElem.appendChild( el ).id = expando;
		return !document.getElementsByName || !document.getElementsByName( expando ).length;
	} );

	// ID filter and find
	if ( support.getById ) {
		Expr.filter[ "ID" ] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute( "id" ) === attrId;
			};
		};
		Expr.find[ "ID" ] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var elem = context.getElementById( id );
				return elem ? [ elem ] : [];
			}
		};
	} else {
		Expr.filter[ "ID" ] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" &&
					elem.getAttributeNode( "id" );
				return node && node.value === attrId;
			};
		};

		// Support: IE 6 - 7 only
		// getElementById is not reliable as a find shortcut
		Expr.find[ "ID" ] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var node, i, elems,
					elem = context.getElementById( id );

				if ( elem ) {

					// Verify the id attribute
					node = elem.getAttributeNode( "id" );
					if ( node && node.value === id ) {
						return [ elem ];
					}

					// Fall back on getElementsByName
					elems = context.getElementsByName( id );
					i = 0;
					while ( ( elem = elems[ i++ ] ) ) {
						node = elem.getAttributeNode( "id" );
						if ( node && node.value === id ) {
							return [ elem ];
						}
					}
				}

				return [];
			}
		};
	}

	// Tag
	Expr.find[ "TAG" ] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,

				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( ( elem = results[ i++ ] ) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find[ "CLASS" ] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See https://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( ( support.qsa = rnative.test( document.querySelectorAll ) ) ) {

		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert( function( el ) {

			var input;

			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// https://bugs.jquery.com/ticket/12359
			docElem.appendChild( el ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\r\\' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// https://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( el.querySelectorAll( "[msallowcapture^='']" ).length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !el.querySelectorAll( "[selected]" ).length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.4, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.8+
			if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push( "~=" );
			}

			// Support: IE 11+, Edge 15 - 18+
			// IE 11/Edge don't find elements on a `[name='']` query in some cases.
			// Adding a temporary attribute to the document before the selection works
			// around the issue.
			// Interestingly, IE 10 & older don't seem to have the issue.
			input = document.createElement( "input" );
			input.setAttribute( "name", "" );
			el.appendChild( input );
			if ( !el.querySelectorAll( "[name='']" ).length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*name" + whitespace + "*=" +
					whitespace + "*(?:''|\"\")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !el.querySelectorAll( ":checked" ).length ) {
				rbuggyQSA.push( ":checked" );
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibling-combinator selector` fails
			if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push( ".#.+[+~]" );
			}

			// Support: Firefox <=3.6 - 5 only
			// Old Firefox doesn't throw on a badly-escaped identifier.
			el.querySelectorAll( "\\\f" );
			rbuggyQSA.push( "[\\r\\n\\f]" );
		} );

		assert( function( el ) {
			el.innerHTML = "<a href='' disabled='disabled'></a>" +
				"<select disabled='disabled'><option/></select>";

			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = document.createElement( "input" );
			input.setAttribute( "type", "hidden" );
			el.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( el.querySelectorAll( "[name=d]" ).length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( el.querySelectorAll( ":enabled" ).length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: IE9-11+
			// IE's :disabled selector does not pick up the children of disabled fieldsets
			docElem.appendChild( el ).disabled = true;
			if ( el.querySelectorAll( ":disabled" ).length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: Opera 10 - 11 only
			// Opera 10-11 does not throw on post-comma invalid pseudos
			el.querySelectorAll( "*,:x" );
			rbuggyQSA.push( ",.*:" );
		} );
	}

	if ( ( support.matchesSelector = rnative.test( ( matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector ) ) ) ) {

		assert( function( el ) {

			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( el, "*" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( el, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		} );
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join( "|" ) );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join( "|" ) );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully self-exclusive
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			) );
		} :
		function( a, b ) {
			if ( b ) {
				while ( ( b = b.parentNode ) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		// Support: IE 11+, Edge 17 - 18+
		// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
		// two documents; shallow comparisons work.
		// eslint-disable-next-line eqeqeq
		compare = ( a.ownerDocument || a ) == ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			( !support.sortDetached && b.compareDocumentPosition( a ) === compare ) ) {

			// Choose the first element that is related to our preferred document
			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			// eslint-disable-next-line eqeqeq
			if ( a == document || a.ownerDocument == preferredDoc &&
				contains( preferredDoc, a ) ) {
				return -1;
			}

			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			// eslint-disable-next-line eqeqeq
			if ( b == document || b.ownerDocument == preferredDoc &&
				contains( preferredDoc, b ) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {

			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			/* eslint-disable eqeqeq */
			return a == document ? -1 :
				b == document ? 1 :
				/* eslint-enable eqeqeq */
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( ( cur = cur.parentNode ) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( ( cur = cur.parentNode ) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[ i ] === bp[ i ] ) {
			i++;
		}

		return i ?

			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[ i ], bp[ i ] ) :

			// Otherwise nodes in our document sort first
			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			/* eslint-disable eqeqeq */
			ap[ i ] == preferredDoc ? -1 :
			bp[ i ] == preferredDoc ? 1 :
			/* eslint-enable eqeqeq */
			0;
	};

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	setDocument( elem );

	if ( support.matchesSelector && documentIsHTML &&
		!nonnativeSelectorCache[ expr + " " ] &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||

				// As well, disconnected nodes are said to be in a document
				// fragment in IE 9
				elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch ( e ) {
			nonnativeSelectorCache( expr, true );
		}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {

	// Set document vars if needed
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( ( context.ownerDocument || context ) != document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {

	// Set document vars if needed
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( ( elem.ownerDocument || elem ) != document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],

		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			( val = elem.getAttributeNode( name ) ) && val.specified ?
				val.value :
				null;
};

Sizzle.escape = function( sel ) {
	return ( sel + "" ).replace( rcssescape, fcssescape );
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( ( elem = results[ i++ ] ) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {

		// If no nodeType, this is expected to be an array
		while ( ( node = elem[ i++ ] ) ) {

			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {

		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {

			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}

	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[ 1 ] = match[ 1 ].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[ 3 ] = ( match[ 3 ] || match[ 4 ] ||
				match[ 5 ] || "" ).replace( runescape, funescape );

			if ( match[ 2 ] === "~=" ) {
				match[ 3 ] = " " + match[ 3 ] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {

			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[ 1 ] = match[ 1 ].toLowerCase();

			if ( match[ 1 ].slice( 0, 3 ) === "nth" ) {

				// nth-* requires argument
				if ( !match[ 3 ] ) {
					Sizzle.error( match[ 0 ] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[ 4 ] = +( match[ 4 ] ?
					match[ 5 ] + ( match[ 6 ] || 1 ) :
					2 * ( match[ 3 ] === "even" || match[ 3 ] === "odd" ) );
				match[ 5 ] = +( ( match[ 7 ] + match[ 8 ] ) || match[ 3 ] === "odd" );

				// other types prohibit arguments
			} else if ( match[ 3 ] ) {
				Sizzle.error( match[ 0 ] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[ 6 ] && match[ 2 ];

			if ( matchExpr[ "CHILD" ].test( match[ 0 ] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[ 3 ] ) {
				match[ 2 ] = match[ 4 ] || match[ 5 ] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&

				// Get excess from tokenize (recursively)
				( excess = tokenize( unquoted, true ) ) &&

				// advance to the next closing parenthesis
				( excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length ) ) {

				// excess is a negative index
				match[ 0 ] = match[ 0 ].slice( 0, excess );
				match[ 2 ] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() {
					return true;
				} :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				( pattern = new RegExp( "(^|" + whitespace +
					")" + className + "(" + whitespace + "|$)" ) ) && classCache(
						className, function( elem ) {
							return pattern.test(
								typeof elem.className === "string" && elem.className ||
								typeof elem.getAttribute !== "undefined" &&
									elem.getAttribute( "class" ) ||
								""
							);
				} );
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				/* eslint-disable max-len */

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
				/* eslint-enable max-len */

			};
		},

		"CHILD": function( type, what, _argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, _context, xml ) {
					var cache, uniqueCache, outerCache, node, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType,
						diff = false;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( ( node = node[ dir ] ) ) {
									if ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) {

										return false;
									}
								}

								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {

							// Seek `elem` from a previously-cached index

							// ...in a gzip-friendly way
							node = parent;
							outerCache = node[ expando ] || ( node[ expando ] = {} );

							// Support: IE <9 only
							// Defend against cloned attroperties (jQuery gh-1709)
							uniqueCache = outerCache[ node.uniqueID ] ||
								( outerCache[ node.uniqueID ] = {} );

							cache = uniqueCache[ type ] || [];
							nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
							diff = nodeIndex && cache[ 2 ];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( ( node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								( diff = nodeIndex = 0 ) || start.pop() ) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									uniqueCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						} else {

							// Use previously-cached element index if available
							if ( useCache ) {

								// ...in a gzip-friendly way
								node = elem;
								outerCache = node[ expando ] || ( node[ expando ] = {} );

								// Support: IE <9 only
								// Defend against cloned attroperties (jQuery gh-1709)
								uniqueCache = outerCache[ node.uniqueID ] ||
									( outerCache[ node.uniqueID ] = {} );

								cache = uniqueCache[ type ] || [];
								nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
								diff = nodeIndex;
							}

							// xml :nth-child(...)
							// or :nth-last-child(...) or :nth(-last)?-of-type(...)
							if ( diff === false ) {

								// Use the same loop as above to seek `elem` from the start
								while ( ( node = ++nodeIndex && node && node[ dir ] ||
									( diff = nodeIndex = 0 ) || start.pop() ) ) {

									if ( ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) &&
										++diff ) {

										// Cache the index of each encountered element
										if ( useCache ) {
											outerCache = node[ expando ] ||
												( node[ expando ] = {} );

											// Support: IE <9 only
											// Defend against cloned attroperties (jQuery gh-1709)
											uniqueCache = outerCache[ node.uniqueID ] ||
												( outerCache[ node.uniqueID ] = {} );

											uniqueCache[ type ] = [ dirruns, diff ];
										}

										if ( node === elem ) {
											break;
										}
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {

			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction( function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[ i ] );
							seed[ idx ] = !( matches[ idx ] = matched[ i ] );
						}
					} ) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {

		// Potentially complex pseudos
		"not": markFunction( function( selector ) {

			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction( function( seed, matches, _context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( ( elem = unmatched[ i ] ) ) {
							seed[ i ] = !( matches[ i ] = elem );
						}
					}
				} ) :
				function( elem, _context, xml ) {
					input[ 0 ] = elem;
					matcher( input, null, xml, results );

					// Don't keep the element (issue #299)
					input[ 0 ] = null;
					return !results.pop();
				};
		} ),

		"has": markFunction( function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		} ),

		"contains": markFunction( function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || getText( elem ) ).indexOf( text ) > -1;
			};
		} ),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {

			// lang value must be a valid identifier
			if ( !ridentifier.test( lang || "" ) ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( ( elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute( "xml:lang" ) || elem.getAttribute( "lang" ) ) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( ( elem = elem.parentNode ) && elem.nodeType === 1 );
				return false;
			};
		} ),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement &&
				( !document.hasFocus || document.hasFocus() ) &&
				!!( elem.type || elem.href || ~elem.tabIndex );
		},

		// Boolean properties
		"enabled": createDisabledPseudo( false ),
		"disabled": createDisabledPseudo( true ),

		"checked": function( elem ) {

			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return ( nodeName === "input" && !!elem.checked ) ||
				( nodeName === "option" && !!elem.selected );
		},

		"selected": function( elem ) {

			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				// eslint-disable-next-line no-unused-expressions
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {

			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos[ "empty" ]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( ( attr = elem.getAttribute( "type" ) ) == null ||
					attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo( function() {
			return [ 0 ];
		} ),

		"last": createPositionalPseudo( function( _matchIndexes, length ) {
			return [ length - 1 ];
		} ),

		"eq": createPositionalPseudo( function( _matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		} ),

		"even": createPositionalPseudo( function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"odd": createPositionalPseudo( function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"lt": createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i = argument < 0 ?
				argument + length :
				argument > length ?
					length :
					argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"gt": createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} )
	}
};

Expr.pseudos[ "nth" ] = Expr.pseudos[ "eq" ];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || ( match = rcomma.exec( soFar ) ) ) {
			if ( match ) {

				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[ 0 ].length ) || soFar;
			}
			groups.push( ( tokens = [] ) );
		}

		matched = false;

		// Combinators
		if ( ( match = rcombinators.exec( soFar ) ) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,

				// Cast descendant combinators to space
				type: match[ 0 ].replace( rtrim, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( ( match = matchExpr[ type ].exec( soFar ) ) && ( !preFilters[ type ] ||
				( match = preFilters[ type ]( match ) ) ) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :

			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[ i ].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		skip = combinator.next,
		key = skip || dir,
		checkNonElements = base && key === "parentNode",
		doneName = done++;

	return combinator.first ?

		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( ( elem = elem[ dir ] ) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
			return false;
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, uniqueCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
			if ( xml ) {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || ( elem[ expando ] = {} );

						// Support: IE <9 only
						// Defend against cloned attroperties (jQuery gh-1709)
						uniqueCache = outerCache[ elem.uniqueID ] ||
							( outerCache[ elem.uniqueID ] = {} );

						if ( skip && skip === elem.nodeName.toLowerCase() ) {
							elem = elem[ dir ] || elem;
						} else if ( ( oldCache = uniqueCache[ key ] ) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return ( newCache[ 2 ] = oldCache[ 2 ] );
						} else {

							// Reuse newcache so results back-propagate to previous elements
							uniqueCache[ key ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( ( newCache[ 2 ] = matcher( elem, context, xml ) ) ) {
								return true;
							}
						}
					}
				}
			}
			return false;
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[ i ]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[ 0 ];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[ i ], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( ( elem = unmatched[ i ] ) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction( function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts(
				selector || "*",
				context.nodeType ? [ context ] : context,
				[]
			),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?

				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( ( elem = temp[ i ] ) ) {
					matcherOut[ postMap[ i ] ] = !( matcherIn[ postMap[ i ] ] = elem );
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {

					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( ( elem = matcherOut[ i ] ) ) {

							// Restore matcherIn since elem is not yet a final match
							temp.push( ( matcherIn[ i ] = elem ) );
						}
					}
					postFinder( null, ( matcherOut = [] ), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( ( elem = matcherOut[ i ] ) &&
						( temp = postFinder ? indexOf( seed, elem ) : preMap[ i ] ) > -1 ) {

						seed[ temp ] = !( results[ temp ] = elem );
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	} );
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[ 0 ].type ],
		implicitRelative = leadingRelative || Expr.relative[ " " ],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				( checkContext = context ).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );

			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( ( matcher = Expr.relative[ tokens[ i ].type ] ) ) {
			matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
		} else {
			matcher = Expr.filter[ tokens[ i ].type ].apply( null, tokens[ i ].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {

				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[ j ].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(

					// If the preceding token was a descendant combinator, insert an implicit any-element `*`
					tokens
						.slice( 0, i - 1 )
						.concat( { value: tokens[ i - 2 ].type === " " ? "*" : "" } )
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( ( tokens = tokens.slice( j ) ) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,

				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find[ "TAG" ]( "*", outermost ),

				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = ( dirruns += contextBackup == null ? 1 : Math.random() || 0.1 ),
				len = elems.length;

			if ( outermost ) {

				// Support: IE 11+, Edge 17 - 18+
				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				outermostContext = context == document || context || outermost;
			}

			// Add elements passing elementMatchers directly to results
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && ( elem = elems[ i ] ) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;

					// Support: IE 11+, Edge 17 - 18+
					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					if ( !context && elem.ownerDocument != document ) {
						setDocument( elem );
						xml = !documentIsHTML;
					}
					while ( ( matcher = elementMatchers[ j++ ] ) ) {
						if ( matcher( elem, context || document, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {

					// They will have gone through all possible matchers
					if ( ( elem = !matcher && elem ) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// `i` is now the count of elements visited above, and adding it to `matchedCount`
			// makes the latter nonnegative.
			matchedCount += i;

			// Apply set filters to unmatched elements
			// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
			// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
			// no element matchers and no seed.
			// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
			// case, which will result in a "00" `matchedCount` that differs from `i` but is also
			// numerically zero.
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( ( matcher = setMatchers[ j++ ] ) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {

					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !( unmatched[ i ] || setMatched[ i ] ) ) {
								setMatched[ i ] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {

		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[ i ] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache(
			selector,
			matcherFromGroupMatchers( elementMatchers, setMatchers )
		);

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( ( selector = compiled.selector || selector ) );

	results = results || [];

	// Try to minimize operations if there is only one selector in the list and no seed
	// (the latter of which guarantees us context)
	if ( match.length === 1 ) {

		// Reduce context if the leading compound selector is an ID
		tokens = match[ 0 ] = match[ 0 ].slice( 0 );
		if ( tokens.length > 2 && ( token = tokens[ 0 ] ).type === "ID" &&
			context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[ 1 ].type ] ) {

			context = ( Expr.find[ "ID" ]( token.matches[ 0 ]
				.replace( runescape, funescape ), context ) || [] )[ 0 ];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr[ "needsContext" ].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[ i ];

			// Abort if we hit a combinator
			if ( Expr.relative[ ( type = token.type ) ] ) {
				break;
			}
			if ( ( find = Expr.find[ type ] ) ) {

				// Search, expanding context for leading sibling combinators
				if ( ( seed = find(
					token.matches[ 0 ].replace( runescape, funescape ),
					rsibling.test( tokens[ 0 ].type ) && testContext( context.parentNode ) ||
						context
				) ) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split( "" ).sort( sortOrder ).join( "" ) === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert( function( el ) {

	// Should return 1, but returns 4 (following)
	return el.compareDocumentPosition( document.createElement( "fieldset" ) ) & 1;
} );

// Support: IE<8
// Prevent attribute/property "interpolation"
// https://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert( function( el ) {
	el.innerHTML = "<a href='#'></a>";
	return el.firstChild.getAttribute( "href" ) === "#";
} ) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	} );
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert( function( el ) {
	el.innerHTML = "<input/>";
	el.firstChild.setAttribute( "value", "" );
	return el.firstChild.getAttribute( "value" ) === "";
} ) ) {
	addHandle( "value", function( elem, _name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	} );
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert( function( el ) {
	return el.getAttribute( "disabled" ) == null;
} ) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
				( val = elem.getAttributeNode( name ) ) && val.specified ?
					val.value :
					null;
		}
	} );
}

return Sizzle;

} )( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;

// Deprecated
jQuery.expr[ ":" ] = jQuery.expr.pseudos;
jQuery.uniqueSort = jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;
jQuery.escapeSelector = Sizzle.escape;




var dir = function( elem, dir, until ) {
	var matched = [],
		truncate = until !== undefined;

	while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
		if ( elem.nodeType === 1 ) {
			if ( truncate && jQuery( elem ).is( until ) ) {
				break;
			}
			matched.push( elem );
		}
	}
	return matched;
};


var siblings = function( n, elem ) {
	var matched = [];

	for ( ; n; n = n.nextSibling ) {
		if ( n.nodeType === 1 && n !== elem ) {
			matched.push( n );
		}
	}

	return matched;
};


var rneedsContext = jQuery.expr.match.needsContext;



function nodeName( elem, name ) {

  return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

};
var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			return !!qualifier.call( elem, i, elem ) !== not;
		} );
	}

	// Single element
	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		} );
	}

	// Arraylike of elements (jQuery, arguments, Array)
	if ( typeof qualifier !== "string" ) {
		return jQuery.grep( elements, function( elem ) {
			return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
		} );
	}

	// Filtered directly for both simple and complex selectors
	return jQuery.filter( qualifier, elements, not );
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	if ( elems.length === 1 && elem.nodeType === 1 ) {
		return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
	}

	return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
		return elem.nodeType === 1;
	} ) );
};

jQuery.fn.extend( {
	find: function( selector ) {
		var i, ret,
			len = this.length,
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter( function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			} ) );
		}

		ret = this.pushStack( [] );

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		return len > 1 ? jQuery.uniqueSort( ret ) : ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow( this, selector || [], false ) );
	},
	not: function( selector ) {
		return this.pushStack( winnow( this, selector || [], true ) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
} );


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	// Shortcut simple #id case for speed
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

	init = jQuery.fn.init = function( selector, context, root ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Method init() accepts an alternate rootjQuery
		// so migrate can support jQuery.sub (gh-2101)
		root = root || rootjQuery;

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[ 0 ] === "<" &&
				selector[ selector.length - 1 ] === ">" &&
				selector.length >= 3 ) {

				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && ( match[ 1 ] || !context ) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[ 1 ] ) {
					context = context instanceof jQuery ? context[ 0 ] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[ 1 ],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {

							// Properties of context are called as methods if possible
							if ( isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[ 2 ] );

					if ( elem ) {

						// Inject the element directly into the jQuery object
						this[ 0 ] = elem;
						this.length = 1;
					}
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || root ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this[ 0 ] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( isFunction( selector ) ) {
			return root.ready !== undefined ?
				root.ready( selector ) :

				// Execute immediately if ready is not present
				selector( jQuery );
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,

	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend( {
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter( function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[ i ] ) ) {
					return true;
				}
			}
		} );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			targets = typeof selectors !== "string" && jQuery( selectors );

		// Positional selectors never match, since there's no _selection_ context
		if ( !rneedsContext.test( selectors ) ) {
			for ( ; i < l; i++ ) {
				for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

					// Always skip document fragments
					if ( cur.nodeType < 11 && ( targets ?
						targets.index( cur ) > -1 :

						// Don't pass non-elements to Sizzle
						cur.nodeType === 1 &&
							jQuery.find.matchesSelector( cur, selectors ) ) ) {

						matched.push( cur );
						break;
					}
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.uniqueSort(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter( selector )
		);
	}
} );

function sibling( cur, dir ) {
	while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each( {
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, _i, until ) {
		return dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, _i, until ) {
		return dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, _i, until ) {
		return dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return siblings( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return siblings( elem.firstChild );
	},
	contents: function( elem ) {
		if ( elem.contentDocument != null &&

			// Support: IE 11+
			// <object> elements with no `data` attribute has an object
			// `contentDocument` with a `null` prototype.
			getProto( elem.contentDocument ) ) {

			return elem.contentDocument;
		}

		// Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
		// Treat the template element as a regular one in browsers that
		// don't support it.
		if ( nodeName( elem, "template" ) ) {
			elem = elem.content || elem;
		}

		return jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {

			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.uniqueSort( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
} );
var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



// Convert String-formatted options into Object-formatted ones
function createOptions( options ) {
	var object = {};
	jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	} );
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		createOptions( options ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,

		// Last fire value for non-forgettable lists
		memory,

		// Flag to know if list was already fired
		fired,

		// Flag to prevent firing
		locked,

		// Actual callback list
		list = [],

		// Queue of execution data for repeatable lists
		queue = [],

		// Index of currently firing callback (modified by add/remove as needed)
		firingIndex = -1,

		// Fire callbacks
		fire = function() {

			// Enforce single-firing
			locked = locked || options.once;

			// Execute callbacks for all pending executions,
			// respecting firingIndex overrides and runtime changes
			fired = firing = true;
			for ( ; queue.length; firingIndex = -1 ) {
				memory = queue.shift();
				while ( ++firingIndex < list.length ) {

					// Run callback and check for early termination
					if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
						options.stopOnFalse ) {

						// Jump to end and forget the data so .add doesn't re-fire
						firingIndex = list.length;
						memory = false;
					}
				}
			}

			// Forget the data if we're done with it
			if ( !options.memory ) {
				memory = false;
			}

			firing = false;

			// Clean up if we're done firing for good
			if ( locked ) {

				// Keep an empty list if we have data for future add calls
				if ( memory ) {
					list = [];

				// Otherwise, this object is spent
				} else {
					list = "";
				}
			}
		},

		// Actual Callbacks object
		self = {

			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {

					// If we have memory from a past run, we should fire after adding
					if ( memory && !firing ) {
						firingIndex = list.length - 1;
						queue.push( memory );
					}

					( function add( args ) {
						jQuery.each( args, function( _, arg ) {
							if ( isFunction( arg ) ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && toType( arg ) !== "string" ) {

								// Inspect recursively
								add( arg );
							}
						} );
					} )( arguments );

					if ( memory && !firing ) {
						fire();
					}
				}
				return this;
			},

			// Remove a callback from the list
			remove: function() {
				jQuery.each( arguments, function( _, arg ) {
					var index;
					while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
						list.splice( index, 1 );

						// Handle firing indexes
						if ( index <= firingIndex ) {
							firingIndex--;
						}
					}
				} );
				return this;
			},

			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ?
					jQuery.inArray( fn, list ) > -1 :
					list.length > 0;
			},

			// Remove all callbacks from the list
			empty: function() {
				if ( list ) {
					list = [];
				}
				return this;
			},

			// Disable .fire and .add
			// Abort any current/pending executions
			// Clear all callbacks and values
			disable: function() {
				locked = queue = [];
				list = memory = "";
				return this;
			},
			disabled: function() {
				return !list;
			},

			// Disable .fire
			// Also disable .add unless we have memory (since it would have no effect)
			// Abort any pending executions
			lock: function() {
				locked = queue = [];
				if ( !memory && !firing ) {
					list = memory = "";
				}
				return this;
			},
			locked: function() {
				return !!locked;
			},

			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( !locked ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					queue.push( args );
					if ( !firing ) {
						fire();
					}
				}
				return this;
			},

			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},

			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


function Identity( v ) {
	return v;
}
function Thrower( ex ) {
	throw ex;
}

function adoptValue( value, resolve, reject, noValue ) {
	var method;

	try {

		// Check for promise aspect first to privilege synchronous behavior
		if ( value && isFunction( ( method = value.promise ) ) ) {
			method.call( value ).done( resolve ).fail( reject );

		// Other thenables
		} else if ( value && isFunction( ( method = value.then ) ) ) {
			method.call( value, resolve, reject );

		// Other non-thenables
		} else {

			// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
			// * false: [ value ].slice( 0 ) => resolve( value )
			// * true: [ value ].slice( 1 ) => resolve()
			resolve.apply( undefined, [ value ].slice( noValue ) );
		}

	// For Promises/A+, convert exceptions into rejections
	// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
	// Deferred#then to conditionally suppress rejection.
	} catch ( value ) {

		// Support: Android 4.0 only
		// Strict mode functions invoked without .call/.apply get global-object context
		reject.apply( undefined, [ value ] );
	}
}

jQuery.extend( {

	Deferred: function( func ) {
		var tuples = [

				// action, add listener, callbacks,
				// ... .then handlers, argument index, [final state]
				[ "notify", "progress", jQuery.Callbacks( "memory" ),
					jQuery.Callbacks( "memory" ), 2 ],
				[ "resolve", "done", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 0, "resolved" ],
				[ "reject", "fail", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 1, "rejected" ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				"catch": function( fn ) {
					return promise.then( null, fn );
				},

				// Keep pipe for back-compat
				pipe: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;

					return jQuery.Deferred( function( newDefer ) {
						jQuery.each( tuples, function( _i, tuple ) {

							// Map tuples (progress, done, fail) to arguments (done, fail, progress)
							var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

							// deferred.progress(function() { bind to newDefer or newDefer.notify })
							// deferred.done(function() { bind to newDefer or newDefer.resolve })
							// deferred.fail(function() { bind to newDefer or newDefer.reject })
							deferred[ tuple[ 1 ] ]( function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && isFunction( returned.promise ) ) {
									returned.promise()
										.progress( newDefer.notify )
										.done( newDefer.resolve )
										.fail( newDefer.reject );
								} else {
									newDefer[ tuple[ 0 ] + "With" ](
										this,
										fn ? [ returned ] : arguments
									);
								}
							} );
						} );
						fns = null;
					} ).promise();
				},
				then: function( onFulfilled, onRejected, onProgress ) {
					var maxDepth = 0;
					function resolve( depth, deferred, handler, special ) {
						return function() {
							var that = this,
								args = arguments,
								mightThrow = function() {
									var returned, then;

									// Support: Promises/A+ section 2.3.3.3.3
									// https://promisesaplus.com/#point-59
									// Ignore double-resolution attempts
									if ( depth < maxDepth ) {
										return;
									}

									returned = handler.apply( that, args );

									// Support: Promises/A+ section 2.3.1
									// https://promisesaplus.com/#point-48
									if ( returned === deferred.promise() ) {
										throw new TypeError( "Thenable self-resolution" );
									}

									// Support: Promises/A+ sections 2.3.3.1, 3.5
									// https://promisesaplus.com/#point-54
									// https://promisesaplus.com/#point-75
									// Retrieve `then` only once
									then = returned &&

										// Support: Promises/A+ section 2.3.4
										// https://promisesaplus.com/#point-64
										// Only check objects and functions for thenability
										( typeof returned === "object" ||
											typeof returned === "function" ) &&
										returned.then;

									// Handle a returned thenable
									if ( isFunction( then ) ) {

										// Special processors (notify) just wait for resolution
										if ( special ) {
											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special )
											);

										// Normal processors (resolve) also hook into progress
										} else {

											// ...and disregard older resolution values
											maxDepth++;

											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special ),
												resolve( maxDepth, deferred, Identity,
													deferred.notifyWith )
											);
										}

									// Handle all other returned values
									} else {

										// Only substitute handlers pass on context
										// and multiple values (non-spec behavior)
										if ( handler !== Identity ) {
											that = undefined;
											args = [ returned ];
										}

										// Process the value(s)
										// Default process is resolve
										( special || deferred.resolveWith )( that, args );
									}
								},

								// Only normal processors (resolve) catch and reject exceptions
								process = special ?
									mightThrow :
									function() {
										try {
											mightThrow();
										} catch ( e ) {

											if ( jQuery.Deferred.exceptionHook ) {
												jQuery.Deferred.exceptionHook( e,
													process.stackTrace );
											}

											// Support: Promises/A+ section 2.3.3.3.4.1
											// https://promisesaplus.com/#point-61
											// Ignore post-resolution exceptions
											if ( depth + 1 >= maxDepth ) {

												// Only substitute handlers pass on context
												// and multiple values (non-spec behavior)
												if ( handler !== Thrower ) {
													that = undefined;
													args = [ e ];
												}

												deferred.rejectWith( that, args );
											}
										}
									};

							// Support: Promises/A+ section 2.3.3.3.1
							// https://promisesaplus.com/#point-57
							// Re-resolve promises immediately to dodge false rejection from
							// subsequent errors
							if ( depth ) {
								process();
							} else {

								// Call an optional hook to record the stack, in case of exception
								// since it's otherwise lost when execution goes async
								if ( jQuery.Deferred.getStackHook ) {
									process.stackTrace = jQuery.Deferred.getStackHook();
								}
								window.setTimeout( process );
							}
						};
					}

					return jQuery.Deferred( function( newDefer ) {

						// progress_handlers.add( ... )
						tuples[ 0 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onProgress ) ?
									onProgress :
									Identity,
								newDefer.notifyWith
							)
						);

						// fulfilled_handlers.add( ... )
						tuples[ 1 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onFulfilled ) ?
									onFulfilled :
									Identity
							)
						);

						// rejected_handlers.add( ... )
						tuples[ 2 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onRejected ) ?
									onRejected :
									Thrower
							)
						);
					} ).promise();
				},

				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 5 ];

			// promise.progress = list.add
			// promise.done = list.add
			// promise.fail = list.add
			promise[ tuple[ 1 ] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(
					function() {

						// state = "resolved" (i.e., fulfilled)
						// state = "rejected"
						state = stateString;
					},

					// rejected_callbacks.disable
					// fulfilled_callbacks.disable
					tuples[ 3 - i ][ 2 ].disable,

					// rejected_handlers.disable
					// fulfilled_handlers.disable
					tuples[ 3 - i ][ 3 ].disable,

					// progress_callbacks.lock
					tuples[ 0 ][ 2 ].lock,

					// progress_handlers.lock
					tuples[ 0 ][ 3 ].lock
				);
			}

			// progress_handlers.fire
			// fulfilled_handlers.fire
			// rejected_handlers.fire
			list.add( tuple[ 3 ].fire );

			// deferred.notify = function() { deferred.notifyWith(...) }
			// deferred.resolve = function() { deferred.resolveWith(...) }
			// deferred.reject = function() { deferred.rejectWith(...) }
			deferred[ tuple[ 0 ] ] = function() {
				deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
				return this;
			};

			// deferred.notifyWith = list.fireWith
			// deferred.resolveWith = list.fireWith
			// deferred.rejectWith = list.fireWith
			deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
		} );

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( singleValue ) {
		var

			// count of uncompleted subordinates
			remaining = arguments.length,

			// count of unprocessed arguments
			i = remaining,

			// subordinate fulfillment data
			resolveContexts = Array( i ),
			resolveValues = slice.call( arguments ),

			// the master Deferred
			master = jQuery.Deferred(),

			// subordinate callback factory
			updateFunc = function( i ) {
				return function( value ) {
					resolveContexts[ i ] = this;
					resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( !( --remaining ) ) {
						master.resolveWith( resolveContexts, resolveValues );
					}
				};
			};

		// Single- and empty arguments are adopted like Promise.resolve
		if ( remaining <= 1 ) {
			adoptValue( singleValue, master.done( updateFunc( i ) ).resolve, master.reject,
				!remaining );

			// Use .then() to unwrap secondary thenables (cf. gh-3000)
			if ( master.state() === "pending" ||
				isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

				return master.then();
			}
		}

		// Multiple arguments are aggregated like Promise.all array elements
		while ( i-- ) {
			adoptValue( resolveValues[ i ], updateFunc( i ), master.reject );
		}

		return master.promise();
	}
} );


// These usually indicate a programmer mistake during development,
// warn about them ASAP rather than swallowing them by default.
var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

jQuery.Deferred.exceptionHook = function( error, stack ) {

	// Support: IE 8 - 9 only
	// Console exists when dev tools are open, which can happen at any time
	if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
		window.console.warn( "jQuery.Deferred exception: " + error.message, error.stack, stack );
	}
};




jQuery.readyException = function( error ) {
	window.setTimeout( function() {
		throw error;
	} );
};




// The deferred used on DOM ready
var readyList = jQuery.Deferred();

jQuery.fn.ready = function( fn ) {

	readyList
		.then( fn )

		// Wrap jQuery.readyException in a function so that the lookup
		// happens at the time of error handling instead of callback
		// registration.
		.catch( function( error ) {
			jQuery.readyException( error );
		} );

	return this;
};

jQuery.extend( {

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );
	}
} );

jQuery.ready.then = readyList.then;

// The ready event handler and self cleanup method
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed );
	window.removeEventListener( "load", completed );
	jQuery.ready();
}

// Catch cases where $(document).ready() is called
// after the browser event has already occurred.
// Support: IE <=9 - 10 only
// Older IE sometimes signals "interactive" too soon
if ( document.readyState === "complete" ||
	( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

	// Handle it asynchronously to allow scripts the opportunity to delay ready
	window.setTimeout( jQuery.ready );

} else {

	// Use the handy event callback
	document.addEventListener( "DOMContentLoaded", completed );

	// A fallback to window.onload, that will always work
	window.addEventListener( "load", completed );
}




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( toType( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			access( elems, fn, i, key[ i ], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {

			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, _key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn(
					elems[ i ], key, raw ?
					value :
					value.call( elems[ i ], i, fn( elems[ i ], key ) )
				);
			}
		}
	}

	if ( chainable ) {
		return elems;
	}

	// Gets
	if ( bulk ) {
		return fn.call( elems );
	}

	return len ? fn( elems[ 0 ], key ) : emptyGet;
};


// Matches dashed string for camelizing
var rmsPrefix = /^-ms-/,
	rdashAlpha = /-([a-z])/g;

// Used by camelCase as callback to replace()
function fcamelCase( _all, letter ) {
	return letter.toUpperCase();
}

// Convert dashed to camelCase; used by the css and data modules
// Support: IE <=9 - 11, Edge 12 - 15
// Microsoft forgot to hump their vendor prefix (#9572)
function camelCase( string ) {
	return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
}
var acceptData = function( owner ) {

	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};




function Data() {
	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;

Data.prototype = {

	cache: function( owner ) {

		// Check if the owner object already has a cache
		var value = owner[ this.expando ];

		// If not, create one
		if ( !value ) {
			value = {};

			// We can accept data for non-element nodes in modern browsers,
			// but we should not, see #8335.
			// Always return an empty object.
			if ( acceptData( owner ) ) {

				// If it is a node unlikely to be stringify-ed or looped over
				// use plain assignment
				if ( owner.nodeType ) {
					owner[ this.expando ] = value;

				// Otherwise secure it in a non-enumerable property
				// configurable must be true to allow the property to be
				// deleted when data is removed
				} else {
					Object.defineProperty( owner, this.expando, {
						value: value,
						configurable: true
					} );
				}
			}
		}

		return value;
	},
	set: function( owner, data, value ) {
		var prop,
			cache = this.cache( owner );

		// Handle: [ owner, key, value ] args
		// Always use camelCase key (gh-2257)
		if ( typeof data === "string" ) {
			cache[ camelCase( data ) ] = value;

		// Handle: [ owner, { properties } ] args
		} else {

			// Copy the properties one-by-one to the cache object
			for ( prop in data ) {
				cache[ camelCase( prop ) ] = data[ prop ];
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		return key === undefined ?
			this.cache( owner ) :

			// Always use camelCase key (gh-2257)
			owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
	},
	access: function( owner, key, value ) {

		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				( ( key && typeof key === "string" ) && value === undefined ) ) {

			return this.get( owner, key );
		}

		// When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i,
			cache = owner[ this.expando ];

		if ( cache === undefined ) {
			return;
		}

		if ( key !== undefined ) {

			// Support array or space separated string of keys
			if ( Array.isArray( key ) ) {

				// If key is an array of keys...
				// We always set camelCase keys, so remove that.
				key = key.map( camelCase );
			} else {
				key = camelCase( key );

				// If a key with the spaces exists, use it.
				// Otherwise, create an array by matching non-whitespace
				key = key in cache ?
					[ key ] :
					( key.match( rnothtmlwhite ) || [] );
			}

			i = key.length;

			while ( i-- ) {
				delete cache[ key[ i ] ];
			}
		}

		// Remove the expando if there's no more data
		if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

			// Support: Chrome <=35 - 45
			// Webkit & Blink performance suffers when deleting properties
			// from DOM nodes, so set to undefined instead
			// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
			if ( owner.nodeType ) {
				owner[ this.expando ] = undefined;
			} else {
				delete owner[ this.expando ];
			}
		}
	},
	hasData: function( owner ) {
		var cache = owner[ this.expando ];
		return cache !== undefined && !jQuery.isEmptyObject( cache );
	}
};
var dataPriv = new Data();

var dataUser = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /[A-Z]/g;

function getData( data ) {
	if ( data === "true" ) {
		return true;
	}

	if ( data === "false" ) {
		return false;
	}

	if ( data === "null" ) {
		return null;
	}

	// Only convert to a number if it doesn't change the string
	if ( data === +data + "" ) {
		return +data;
	}

	if ( rbrace.test( data ) ) {
		return JSON.parse( data );
	}

	return data;
}

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = getData( data );
			} catch ( e ) {}

			// Make sure we set the data so it isn't changed later
			dataUser.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend( {
	hasData: function( elem ) {
		return dataUser.hasData( elem ) || dataPriv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return dataUser.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		dataUser.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to dataPriv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return dataPriv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		dataPriv.remove( elem, name );
	}
} );

jQuery.fn.extend( {
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = dataUser.get( elem );

				if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE 11 only
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = camelCase( name.slice( 5 ) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					dataPriv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each( function() {
				dataUser.set( this, key );
			} );
		}

		return access( this, function( value ) {
			var data;

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {

				// Attempt to get data from the cache
				// The key will always be camelCased in Data
				data = dataUser.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each( function() {

				// We always store the camelCased key
				dataUser.set( this, key, value );
			} );
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each( function() {
			dataUser.remove( this, key );
		} );
	}
} );


jQuery.extend( {
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = dataPriv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || Array.isArray( data ) ) {
					queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
			empty: jQuery.Callbacks( "once memory" ).add( function() {
				dataPriv.remove( elem, [ type + "queue", key ] );
			} )
		} );
	}
} );

jQuery.fn.extend( {
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[ 0 ], type );
		}

		return data === undefined ?
			this :
			this.each( function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			} );
	},
	dequeue: function( type ) {
		return this.each( function() {
			jQuery.dequeue( this, type );
		} );
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},

	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
} );
var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var documentElement = document.documentElement;



	var isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem );
		},
		composed = { composed: true };

	// Support: IE 9 - 11+, Edge 12 - 18+, iOS 10.0 - 10.2 only
	// Check attachment across shadow DOM boundaries when possible (gh-3504)
	// Support: iOS 10.0-10.2 only
	// Early iOS 10 versions support `attachShadow` but not `getRootNode`,
	// leading to errors. We need to check for `getRootNode`.
	if ( documentElement.getRootNode ) {
		isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem ) ||
				elem.getRootNode( composed ) === elem.ownerDocument;
		};
	}
var isHiddenWithinTree = function( elem, el ) {

		// isHiddenWithinTree might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;

		// Inline style trumps all
		return elem.style.display === "none" ||
			elem.style.display === "" &&

			// Otherwise, check computed style
			// Support: Firefox <=43 - 45
			// Disconnected elements can have computed display: none, so first confirm that elem is
			// in the document.
			isAttached( elem ) &&

			jQuery.css( elem, "display" ) === "none";
	};



function adjustCSS( elem, prop, valueParts, tween ) {
	var adjusted, scale,
		maxIterations = 20,
		currentValue = tween ?
			function() {
				return tween.cur();
			} :
			function() {
				return jQuery.css( elem, prop, "" );
			},
		initial = currentValue(),
		unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

		// Starting value computation is required for potential unit mismatches
		initialInUnit = elem.nodeType &&
			( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
			rcssNum.exec( jQuery.css( elem, prop ) );

	if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

		// Support: Firefox <=54
		// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
		initial = initial / 2;

		// Trust units reported by jQuery.css
		unit = unit || initialInUnit[ 3 ];

		// Iteratively approximate from a nonzero starting point
		initialInUnit = +initial || 1;

		while ( maxIterations-- ) {

			// Evaluate and update our best guess (doubling guesses that zero out).
			// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
			jQuery.style( elem, prop, initialInUnit + unit );
			if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
				maxIterations = 0;
			}
			initialInUnit = initialInUnit / scale;

		}

		initialInUnit = initialInUnit * 2;
		jQuery.style( elem, prop, initialInUnit + unit );

		// Make sure we update the tween properties later on
		valueParts = valueParts || [];
	}

	if ( valueParts ) {
		initialInUnit = +initialInUnit || +initial || 0;

		// Apply relative offset (+=/-=) if specified
		adjusted = valueParts[ 1 ] ?
			initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
			+valueParts[ 2 ];
		if ( tween ) {
			tween.unit = unit;
			tween.start = initialInUnit;
			tween.end = adjusted;
		}
	}
	return adjusted;
}


var defaultDisplayMap = {};

function getDefaultDisplay( elem ) {
	var temp,
		doc = elem.ownerDocument,
		nodeName = elem.nodeName,
		display = defaultDisplayMap[ nodeName ];

	if ( display ) {
		return display;
	}

	temp = doc.body.appendChild( doc.createElement( nodeName ) );
	display = jQuery.css( temp, "display" );

	temp.parentNode.removeChild( temp );

	if ( display === "none" ) {
		display = "block";
	}
	defaultDisplayMap[ nodeName ] = display;

	return display;
}

function showHide( elements, show ) {
	var display, elem,
		values = [],
		index = 0,
		length = elements.length;

	// Determine new display value for elements that need to change
	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		display = elem.style.display;
		if ( show ) {

			// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
			// check is required in this first loop unless we have a nonempty display value (either
			// inline or about-to-be-restored)
			if ( display === "none" ) {
				values[ index ] = dataPriv.get( elem, "display" ) || null;
				if ( !values[ index ] ) {
					elem.style.display = "";
				}
			}
			if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
				values[ index ] = getDefaultDisplay( elem );
			}
		} else {
			if ( display !== "none" ) {
				values[ index ] = "none";

				// Remember what we're overwriting
				dataPriv.set( elem, "display", display );
			}
		}
	}

	// Set the display of the elements in a second loop to avoid constant reflow
	for ( index = 0; index < length; index++ ) {
		if ( values[ index ] != null ) {
			elements[ index ].style.display = values[ index ];
		}
	}

	return elements;
}

jQuery.fn.extend( {
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each( function() {
			if ( isHiddenWithinTree( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		} );
	}
} );
var rcheckableType = ( /^(?:checkbox|radio)$/i );

var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]*)/i );

var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



( function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Android 4.0 - 4.3 only
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Android <=4.1 only
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE <=11 only
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

	// Support: IE <=9 only
	// IE <=9 replaces <option> tags with their contents when inserted outside of
	// the select element.
	div.innerHTML = "<option></option>";
	support.option = !!div.lastChild;
} )();


// We have to close these tags to support XHTML (#13200)
var wrapMap = {

	// XHTML parsers do not magically insert elements in the
	// same way that tag soup parsers do. So we cannot shorten
	// this by omitting <tbody> or other required elements.
	thead: [ 1, "<table>", "</table>" ],
	col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
	tr: [ 2, "<table><tbody>", "</tbody></table>" ],
	td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

	_default: [ 0, "", "" ]
};

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: IE <=9 only
if ( !support.option ) {
	wrapMap.optgroup = wrapMap.option = [ 1, "<select multiple='multiple'>", "</select>" ];
}


function getAll( context, tag ) {

	// Support: IE <=9 - 11 only
	// Use typeof to avoid zero-argument method invocation on host objects (#15151)
	var ret;

	if ( typeof context.getElementsByTagName !== "undefined" ) {
		ret = context.getElementsByTagName( tag || "*" );

	} else if ( typeof context.querySelectorAll !== "undefined" ) {
		ret = context.querySelectorAll( tag || "*" );

	} else {
		ret = [];
	}

	if ( tag === undefined || tag && nodeName( context, tag ) ) {
		return jQuery.merge( [ context ], ret );
	}

	return ret;
}


// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		dataPriv.set(
			elems[ i ],
			"globalEval",
			!refElements || dataPriv.get( refElements[ i ], "globalEval" )
		);
	}
}


var rhtml = /<|&#?\w+;/;

function buildFragment( elems, context, scripts, selection, ignored ) {
	var elem, tmp, tag, wrap, attached, j,
		fragment = context.createDocumentFragment(),
		nodes = [],
		i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		elem = elems[ i ];

		if ( elem || elem === 0 ) {

			// Add nodes directly
			if ( toType( elem ) === "object" ) {

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

			// Convert non-html into a text node
			} else if ( !rhtml.test( elem ) ) {
				nodes.push( context.createTextNode( elem ) );

			// Convert html into DOM nodes
			} else {
				tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

				// Deserialize a standard representation
				tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
				wrap = wrapMap[ tag ] || wrapMap._default;
				tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

				// Descend through wrappers to the right content
				j = wrap[ 0 ];
				while ( j-- ) {
					tmp = tmp.lastChild;
				}

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, tmp.childNodes );

				// Remember the top-level container
				tmp = fragment.firstChild;

				// Ensure the created nodes are orphaned (#12392)
				tmp.textContent = "";
			}
		}
	}

	// Remove wrapper from fragment
	fragment.textContent = "";

	i = 0;
	while ( ( elem = nodes[ i++ ] ) ) {

		// Skip elements already in the context collection (trac-4087)
		if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
			if ( ignored ) {
				ignored.push( elem );
			}
			continue;
		}

		attached = isAttached( elem );

		// Append to fragment
		tmp = getAll( fragment.appendChild( elem ), "script" );

		// Preserve script evaluation history
		if ( attached ) {
			setGlobalEval( tmp );
		}

		// Capture executables
		if ( scripts ) {
			j = 0;
			while ( ( elem = tmp[ j++ ] ) ) {
				if ( rscriptType.test( elem.type || "" ) ) {
					scripts.push( elem );
				}
			}
		}
	}

	return fragment;
}


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

// Support: IE <=9 - 11+
// focus() and blur() are asynchronous, except when they are no-op.
// So expect focus to be synchronous when the element is already active,
// and blur to be synchronous when the element is not already active.
// (focus and blur are always synchronous in other supported browsers,
// this just defines when we can count on it).
function expectSync( elem, type ) {
	return ( elem === safeActiveElement() ) === ( type === "focus" );
}

// Support: IE <=9 only
// Accessing document.activeElement can throw unexpectedly
// https://bugs.jquery.com/ticket/13393
function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}
	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	if ( one === 1 ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}
	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.get( elem );

		// Only attach events to objects that accept data
		if ( !acceptData( elem ) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = Object.create( null );
		}
		if ( !( eventHandle = elemData.handle ) ) {
			eventHandle = elemData.handle = function( e ) {

				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	dispatch: function( nativeEvent ) {

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),

			// Make a writable jQuery.Event from the native event object
			event = jQuery.event.fix( nativeEvent ),

			handlers = (
					dataPriv.get( this, "events" ) || Object.create( null )
				)[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		if ( delegateCount &&

			// Support: IE <=9
			// Black-hole SVG <use> instance trees (trac-13180)
			cur.nodeType &&

			// Support: Firefox <=42
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			// Support: IE 11 only
			// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: isFunction( hook ) ?
				function() {
					if ( this.originalEvent ) {
							return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
							return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// Utilize native event to ensure correct state for checkable inputs
			setup: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Claim the first handler
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					// dataPriv.set( el, "click", ... )
					leverageNative( el, "click", returnTrue );
				}

				// Return false to allow normal processing in the caller
				return false;
			},
			trigger: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Force setup before triggering a click
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					leverageNative( el, "click" );
				}

				// Return non-false to allow normal event-path propagation
				return true;
			},

			// For cross-browser consistency, suppress native .click() on links
			// Also prevent it if we're currently inside a leveraged native-event stack
			_default: function( event ) {
				var target = event.target;
				return rcheckableType.test( target.type ) &&
					target.click && nodeName( target, "input" ) &&
					dataPriv.get( target, "click" ) ||
					nodeName( target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	}
};

// Ensure the presence of an event listener that handles manually-triggered
// synthetic events by interrupting progress until reinvoked in response to
// *native* events that it fires directly, ensuring that state changes have
// already occurred before other listeners are invoked.
function leverageNative( el, type, expectSync ) {

	// Missing expectSync indicates a trigger call, which must force setup through jQuery.event.add
	if ( !expectSync ) {
		if ( dataPriv.get( el, type ) === undefined ) {
			jQuery.event.add( el, type, returnTrue );
		}
		return;
	}

	// Register the controller as a special universal handler for all event namespaces
	dataPriv.set( el, type, false );
	jQuery.event.add( el, type, {
		namespace: false,
		handler: function( event ) {
			var notAsync, result,
				saved = dataPriv.get( this, type );

			if ( ( event.isTrigger & 1 ) && this[ type ] ) {

				// Interrupt processing of the outer synthetic .trigger()ed event
				// Saved data should be false in such cases, but might be a leftover capture object
				// from an async native handler (gh-4350)
				if ( !saved.length ) {

					// Store arguments for use when handling the inner native event
					// There will always be at least one argument (an event object), so this array
					// will not be confused with a leftover capture object.
					saved = slice.call( arguments );
					dataPriv.set( this, type, saved );

					// Trigger the native event and capture its result
					// Support: IE <=9 - 11+
					// focus() and blur() are asynchronous
					notAsync = expectSync( this, type );
					this[ type ]();
					result = dataPriv.get( this, type );
					if ( saved !== result || notAsync ) {
						dataPriv.set( this, type, false );
					} else {
						result = {};
					}
					if ( saved !== result ) {

						// Cancel the outer synthetic event
						event.stopImmediatePropagation();
						event.preventDefault();
						return result.value;
					}

				// If this is an inner synthetic event for an event with a bubbling surrogate
				// (focus or blur), assume that the surrogate already propagated from triggering the
				// native event and prevent that from happening again here.
				// This technically gets the ordering wrong w.r.t. to `.trigger()` (in which the
				// bubbling surrogate propagates *after* the non-bubbling base), but that seems
				// less bad than duplication.
				} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
					event.stopPropagation();
				}

			// If this is a native event triggered above, everything is now in order
			// Fire an inner synthetic event with the original arguments
			} else if ( saved.length ) {

				// ...and capture the result
				dataPriv.set( this, type, {
					value: jQuery.event.trigger(

						// Support: IE <=9 - 11+
						// Extend with the prototype to reset the above stopImmediatePropagation()
						jQuery.extend( saved[ 0 ], jQuery.Event.prototype ),
						saved.slice( 1 ),
						this
					)
				} );

				// Abort handling of the native event
				event.stopImmediatePropagation();
			}
		}
	} );
}

jQuery.removeEvent = function( elem, type, handle ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&

				// Support: Android <=2.3 only
				src.returnValue === false ?
			returnTrue :
			returnFalse;

		// Create target properties
		// Support: Safari <=6 - 7 only
		// Target should not be a text node (#504, #13143)
		this.target = ( src.target && src.target.nodeType === 3 ) ?
			src.target.parentNode :
			src.target;

		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	code: true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,

	which: function( event ) {
		var button = event.button;

		// Add which for key events
		if ( event.which == null && rkeyEvent.test( event.type ) ) {
			return event.charCode != null ? event.charCode : event.keyCode;
		}

		// Add which for click: 1 === left; 2 === middle; 3 === right
		if ( !event.which && button !== undefined && rmouseEvent.test( event.type ) ) {
			if ( button & 1 ) {
				return 1;
			}

			if ( button & 2 ) {
				return 3;
			}

			if ( button & 4 ) {
				return 2;
			}

			return 0;
		}

		return event.which;
	}
}, jQuery.event.addProp );

jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {
	jQuery.event.special[ type ] = {

		// Utilize native event if possible so blur/focus sequence is correct
		setup: function() {

			// Claim the first handler
			// dataPriv.set( this, "focus", ... )
			// dataPriv.set( this, "blur", ... )
			leverageNative( this, type, expectSync );

			// Return false to allow normal processing in the caller
			return false;
		},
		trigger: function() {

			// Force setup before trigger
			leverageNative( this, type );

			// Return non-false to allow normal event-path propagation
			return true;
		},

		delegateType: delegateType
	};
} );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
//
// Support: Safari 7 only
// Safari sends mouseenter too often; see:
// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
// for the description of the bug (it existed in older Chrome versions as well).
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

jQuery.fn.extend( {

	on: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn );
	},
	one: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );


var

	// Support: IE <=10 - 11, Edge 12 - 13 only
	// In IE/Edge using regex groups here causes severe slowdowns.
	// See https://connect.microsoft.com/IE/feedback/details/1736512/
	rnoInnerhtml = /<script|<style|<link/i,

	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
		elem.type = elem.type.slice( 5 );
	} else {
		elem.removeAttribute( "type" );
	}

	return elem;
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( dataPriv.hasData( src ) ) {
		pdataOld = dataPriv.get( src );
		events = pdataOld.events;

		if ( events ) {
			dataPriv.remove( dest, "handle events" );

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		udataOld = dataUser.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		dataUser.set( dest, udataCur );
	}
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

function domManip( collection, args, callback, ignored ) {

	// Flatten any nested arrays
	args = flat( args );

	var fragment, first, scripts, hasScripts, node, doc,
		i = 0,
		l = collection.length,
		iNoClone = l - 1,
		value = args[ 0 ],
		valueIsFunction = isFunction( value );

	// We can't cloneNode fragments that contain checked, in WebKit
	if ( valueIsFunction ||
			( l > 1 && typeof value === "string" &&
				!support.checkClone && rchecked.test( value ) ) ) {
		return collection.each( function( index ) {
			var self = collection.eq( index );
			if ( valueIsFunction ) {
				args[ 0 ] = value.call( this, index, self.html() );
			}
			domManip( self, args, callback, ignored );
		} );
	}

	if ( l ) {
		fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
		first = fragment.firstChild;

		if ( fragment.childNodes.length === 1 ) {
			fragment = first;
		}

		// Require either new content or an interest in ignored elements to invoke the callback
		if ( first || ignored ) {
			scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
			hasScripts = scripts.length;

			// Use the original fragment for the last item
			// instead of the first because it can end up
			// being emptied incorrectly in certain situations (#8070).
			for ( ; i < l; i++ ) {
				node = fragment;

				if ( i !== iNoClone ) {
					node = jQuery.clone( node, true, true );

					// Keep references to cloned scripts for later restoration
					if ( hasScripts ) {

						// Support: Android <=4.0 only, PhantomJS 1 only
						// push.apply(_, arraylike) throws on ancient WebKit
						jQuery.merge( scripts, getAll( node, "script" ) );
					}
				}

				callback.call( collection[ i ], node, i );
			}

			if ( hasScripts ) {
				doc = scripts[ scripts.length - 1 ].ownerDocument;

				// Reenable scripts
				jQuery.map( scripts, restoreScript );

				// Evaluate executable scripts on first document insertion
				for ( i = 0; i < hasScripts; i++ ) {
					node = scripts[ i ];
					if ( rscriptType.test( node.type || "" ) &&
						!dataPriv.access( node, "globalEval" ) &&
						jQuery.contains( doc, node ) ) {

						if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

							// Optional AJAX dependency, but won't run scripts if not present
							if ( jQuery._evalUrl && !node.noModule ) {
								jQuery._evalUrl( node.src, {
									nonce: node.nonce || node.getAttribute( "nonce" )
								}, doc );
							}
						} else {
							DOMEval( node.textContent.replace( rcleanScript, "" ), node, doc );
						}
					}
				}
			}
		}
	}

	return collection;
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && isAttached( node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html;
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = isAttached( elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: https://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	cleanData: function( elems ) {
		var data, elem, type,
			special = jQuery.event.special,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
			if ( acceptData( elem ) ) {
				if ( ( data = elem[ dataPriv.expando ] ) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataPriv.expando ] = undefined;
				}
				if ( elem[ dataUser.expando ] ) {

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataUser.expando ] = undefined;
				}
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: Android <=4.0 only, PhantomJS 1 only
			// .get() because push.apply(_, arraylike) throws on ancient WebKit
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
} );
var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {

		// Support: IE <=11 only, Firefox <=30 (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		var view = elem.ownerDocument.defaultView;

		if ( !view || !view.opener ) {
			view = window;
		}

		return view.getComputedStyle( elem );
	};

var swap = function( elem, options, callback ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.call( elem );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



( function() {

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computeStyleTests() {

		// This is a singleton, we need to execute it only once
		if ( !div ) {
			return;
		}

		container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
			"margin-top:1px;padding:0;border:0";
		div.style.cssText =
			"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
			"margin:auto;border:1px;padding:1px;" +
			"width:60%;top:1%";
		documentElement.appendChild( container ).appendChild( div );

		var divStyle = window.getComputedStyle( div );
		pixelPositionVal = divStyle.top !== "1%";

		// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
		reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

		// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
		// Some styles come back with percentage values, even though they shouldn't
		div.style.right = "60%";
		pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

		// Support: IE 9 - 11 only
		// Detect misreporting of content dimensions for box-sizing:border-box elements
		boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

		// Support: IE 9 only
		// Detect overflow:scroll screwiness (gh-3699)
		// Support: Chrome <=64
		// Don't get tricked when zoom affects offsetWidth (gh-4029)
		div.style.position = "absolute";
		scrollboxSizeVal = roundPixelMeasures( div.offsetWidth / 3 ) === 12;

		documentElement.removeChild( container );

		// Nullify the div so it wouldn't be stored in the memory and
		// it will also be a sign that checks already performed
		div = null;
	}

	function roundPixelMeasures( measure ) {
		return Math.round( parseFloat( measure ) );
	}

	var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
		reliableTrDimensionsVal, reliableMarginLeftVal,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	// Finish early in limited (non-browser) environments
	if ( !div.style ) {
		return;
	}

	// Support: IE <=9 - 11 only
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	jQuery.extend( support, {
		boxSizingReliable: function() {
			computeStyleTests();
			return boxSizingReliableVal;
		},
		pixelBoxStyles: function() {
			computeStyleTests();
			return pixelBoxStylesVal;
		},
		pixelPosition: function() {
			computeStyleTests();
			return pixelPositionVal;
		},
		reliableMarginLeft: function() {
			computeStyleTests();
			return reliableMarginLeftVal;
		},
		scrollboxSize: function() {
			computeStyleTests();
			return scrollboxSizeVal;
		},

		// Support: IE 9 - 11+, Edge 15 - 18+
		// IE/Edge misreport `getComputedStyle` of table rows with width/height
		// set in CSS while `offset*` properties report correct values.
		// Behavior in IE 9 is more subtle than in newer versions & it passes
		// some versions of this test; make sure not to make it pass there!
		reliableTrDimensions: function() {
			var table, tr, trChild, trStyle;
			if ( reliableTrDimensionsVal == null ) {
				table = document.createElement( "table" );
				tr = document.createElement( "tr" );
				trChild = document.createElement( "div" );

				table.style.cssText = "position:absolute;left:-11111px";
				tr.style.height = "1px";
				trChild.style.height = "9px";

				documentElement
					.appendChild( table )
					.appendChild( tr )
					.appendChild( trChild );

				trStyle = window.getComputedStyle( tr );
				reliableTrDimensionsVal = parseInt( trStyle.height ) > 3;

				documentElement.removeChild( table );
			}
			return reliableTrDimensionsVal;
		}
	} );
} )();


function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,

		// Support: Firefox 51+
		// Retrieving style before computed somehow
		// fixes an issue with getting wrong values
		// on detached elements
		style = elem.style;

	computed = computed || getStyles( elem );

	// getPropertyValue is needed for:
	//   .css('filter') (IE 9 only, #12537)
	//   .css('--customProperty) (#3144)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];

		if ( ret === "" && !isAttached( elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// A tribute to the "awesome hack by Dean Edwards"
		// Android Browser returns percentage for some values,
		// but width seems to be reliably pixels.
		// This is against the CSSOM draft spec:
		// https://drafts.csswg.org/cssom/#resolved-values
		if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?

		// Support: IE <=9 - 11 only
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {

	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {

				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return ( this.get = hookFn ).apply( this, arguments );
		}
	};
}


var cssPrefixes = [ "Webkit", "Moz", "ms" ],
	emptyStyle = document.createElement( "div" ).style,
	vendorProps = {};

// Return a vendor-prefixed property or undefined
function vendorPropName( name ) {

	// Check for vendor prefixed names
	var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in emptyStyle ) {
			return name;
		}
	}
}

// Return a potentially-mapped jQuery.cssProps or vendor prefixed property
function finalPropName( name ) {
	var final = jQuery.cssProps[ name ] || vendorProps[ name ];

	if ( final ) {
		return final;
	}
	if ( name in emptyStyle ) {
		return name;
	}
	return vendorProps[ name ] = vendorPropName( name ) || name;
}


var

	// Swappable if display is none or starts with table
	// except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rcustomProp = /^--/,
	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	};

function setPositiveNumber( _elem, value, subtract ) {

	// Any relative (+/-) values have already been
	// normalized at this point
	var matches = rcssNum.exec( value );
	return matches ?

		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
		value;
}

function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
	var i = dimension === "width" ? 1 : 0,
		extra = 0,
		delta = 0;

	// Adjustment may not be necessary
	if ( box === ( isBorderBox ? "border" : "content" ) ) {
		return 0;
	}

	for ( ; i < 4; i += 2 ) {

		// Both box models exclude margin
		if ( box === "margin" ) {
			delta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
		}

		// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
		if ( !isBorderBox ) {

			// Add padding
			delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// For "border" or "margin", add border
			if ( box !== "padding" ) {
				delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

			// But still keep track of it otherwise
			} else {
				extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}

		// If we get here with a border-box (content + padding + border), we're seeking "content" or
		// "padding" or "margin"
		} else {

			// For "content", subtract padding
			if ( box === "content" ) {
				delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// For "content" or "padding", subtract border
			if ( box !== "margin" ) {
				delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	// Account for positive content-box scroll gutter when requested by providing computedVal
	if ( !isBorderBox && computedVal >= 0 ) {

		// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
		// Assuming integer scroll gutter, subtract the rest and round down
		delta += Math.max( 0, Math.ceil(
			elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
			computedVal -
			delta -
			extra -
			0.5

		// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
		// Use an explicit zero to avoid NaN (gh-3964)
		) ) || 0;
	}

	return delta;
}

function getWidthOrHeight( elem, dimension, extra ) {

	// Start with computed style
	var styles = getStyles( elem ),

		// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
		// Fake content-box until we know it's needed to know the true value.
		boxSizingNeeded = !support.boxSizingReliable() || extra,
		isBorderBox = boxSizingNeeded &&
			jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
		valueIsBorderBox = isBorderBox,

		val = curCSS( elem, dimension, styles ),
		offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

	// Support: Firefox <=54
	// Return a confounding non-pixel value or feign ignorance, as appropriate.
	if ( rnumnonpx.test( val ) ) {
		if ( !extra ) {
			return val;
		}
		val = "auto";
	}


	// Support: IE 9 - 11 only
	// Use offsetWidth/offsetHeight for when box sizing is unreliable.
	// In those cases, the computed value can be trusted to be border-box.
	if ( ( !support.boxSizingReliable() && isBorderBox ||

		// Support: IE 10 - 11+, Edge 15 - 18+
		// IE/Edge misreport `getComputedStyle` of table rows with width/height
		// set in CSS while `offset*` properties report correct values.
		// Interestingly, in some cases IE 9 doesn't suffer from this issue.
		!support.reliableTrDimensions() && nodeName( elem, "tr" ) ||

		// Fall back to offsetWidth/offsetHeight when value is "auto"
		// This happens for inline elements with no explicit setting (gh-3571)
		val === "auto" ||

		// Support: Android <=4.1 - 4.3 only
		// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
		!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) &&

		// Make sure the element is visible & connected
		elem.getClientRects().length ) {

		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

		// Where available, offsetWidth/offsetHeight approximate border box dimensions.
		// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
		// retrieved value as a content box dimension.
		valueIsBorderBox = offsetProp in elem;
		if ( valueIsBorderBox ) {
			val = elem[ offsetProp ];
		}
	}

	// Normalize "" and auto
	val = parseFloat( val ) || 0;

	// Adjust for the element's box model
	return ( val +
		boxModelAdjustment(
			elem,
			dimension,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles,

			// Provide the current computed size to request scroll gutter calculation (gh-3589)
			val
		)
	) + "px";
}

jQuery.extend( {

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"animationIterationCount": true,
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"gridArea": true,
		"gridColumn": true,
		"gridColumnEnd": true,
		"gridColumnStart": true,
		"gridRow": true,
		"gridRowEnd": true,
		"gridRowStart": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name ),
			style = elem.style;

		// Make sure that we're working with the right name. We don't
		// want to query the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
				value = adjustCSS( elem, name, ret );

				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add the unit (except for certain CSS properties)
			// The isCustomProp check can be removed in jQuery 4.0 when we only auto-append
			// "px" to a few hardcoded values.
			if ( type === "number" && !isCustomProp ) {
				value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
			}

			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !( "set" in hooks ) ||
				( value = hooks.set( elem, value, extra ) ) !== undefined ) {

				if ( isCustomProp ) {
					style.setProperty( name, value );
				} else {
					style[ name ] = value;
				}
			}

		} else {

			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks &&
				( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name );

		// Make sure that we're working with the right name. We don't
		// want to modify the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || isFinite( num ) ? num || 0 : val;
		}

		return val;
	}
} );

jQuery.each( [ "height", "width" ], function( _i, dimension ) {
	jQuery.cssHooks[ dimension ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

					// Support: Safari 8+
					// Table columns in Safari have non-zero offsetWidth & zero
					// getBoundingClientRect().width unless display is changed.
					// Support: IE <=11 only
					// Running getBoundingClientRect on a disconnected node
					// in IE throws an error.
					( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
						swap( elem, cssShow, function() {
							return getWidthOrHeight( elem, dimension, extra );
						} ) :
						getWidthOrHeight( elem, dimension, extra );
			}
		},

		set: function( elem, value, extra ) {
			var matches,
				styles = getStyles( elem ),

				// Only read styles.position if the test has a chance to fail
				// to avoid forcing a reflow.
				scrollboxSizeBuggy = !support.scrollboxSize() &&
					styles.position === "absolute",

				// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
				boxSizingNeeded = scrollboxSizeBuggy || extra,
				isBorderBox = boxSizingNeeded &&
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
				subtract = extra ?
					boxModelAdjustment(
						elem,
						dimension,
						extra,
						isBorderBox,
						styles
					) :
					0;

			// Account for unreliable border-box dimensions by comparing offset* to computed and
			// faking a content-box to get border and padding (gh-3699)
			if ( isBorderBox && scrollboxSizeBuggy ) {
				subtract -= Math.ceil(
					elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
					parseFloat( styles[ dimension ] ) -
					boxModelAdjustment( elem, dimension, "border", false, styles ) -
					0.5
				);
			}

			// Convert to pixels if value adjustment is needed
			if ( subtract && ( matches = rcssNum.exec( value ) ) &&
				( matches[ 3 ] || "px" ) !== "px" ) {

				elem.style[ dimension ] = value;
				value = jQuery.css( elem, dimension );
			}

			return setPositiveNumber( elem, value, subtract );
		}
	};
} );

jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
	function( elem, computed ) {
		if ( computed ) {
			return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
				elem.getBoundingClientRect().left -
					swap( elem, { marginLeft: 0 }, function() {
						return elem.getBoundingClientRect().left;
					} )
				) + "px";
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each( {
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split( " " ) : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( prefix !== "margin" ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
} );

jQuery.fn.extend( {
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( Array.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	}
} );


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || jQuery.easing._default;
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			// Use a property on the element directly when it is not a DOM element,
			// or when there is no matching style property that exists.
			if ( tween.elem.nodeType !== 1 ||
				tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );

			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {

			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.nodeType === 1 && (
					jQuery.cssHooks[ tween.prop ] ||
					tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9 only
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	},
	_default: "swing"
};

jQuery.fx = Tween.prototype.init;

// Back compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, inProgress,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rrun = /queueHooks$/;

function schedule() {
	if ( inProgress ) {
		if ( document.hidden === false && window.requestAnimationFrame ) {
			window.requestAnimationFrame( schedule );
		} else {
			window.setTimeout( schedule, jQuery.fx.interval );
		}

		jQuery.fx.tick();
	}
}

// Animations created synchronously will run synchronously
function createFxNow() {
	window.setTimeout( function() {
		fxNow = undefined;
	} );
	return ( fxNow = Date.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
		isBox = "width" in props || "height" in props,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHiddenWithinTree( elem ),
		dataShow = dataPriv.get( elem, "fxshow" );

	// Queue-skipping animations hijack the fx hooks
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always( function() {

			// Ensure the complete handler is called before this completes
			anim.always( function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			} );
		} );
	}

	// Detect show/hide animations
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.test( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// Pretend to be hidden if this is a "show" and
				// there is still data from a stopped show/hide
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;

				// Ignore all other no-op show/hide data
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	// Bail out if this is a no-op like .hide().hide()
	propTween = !jQuery.isEmptyObject( props );
	if ( !propTween && jQuery.isEmptyObject( orig ) ) {
		return;
	}

	// Restrict "overflow" and "display" styles during box animations
	if ( isBox && elem.nodeType === 1 ) {

		// Support: IE <=9 - 11, Edge 12 - 15
		// Record all 3 overflow attributes because IE does not infer the shorthand
		// from identically-valued overflowX and overflowY and Edge just mirrors
		// the overflowX value there.
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Identify a display type, preferring old show/hide data over the CSS cascade
		restoreDisplay = dataShow && dataShow.display;
		if ( restoreDisplay == null ) {
			restoreDisplay = dataPriv.get( elem, "display" );
		}
		display = jQuery.css( elem, "display" );
		if ( display === "none" ) {
			if ( restoreDisplay ) {
				display = restoreDisplay;
			} else {

				// Get nonempty value(s) by temporarily forcing visibility
				showHide( [ elem ], true );
				restoreDisplay = elem.style.display || restoreDisplay;
				display = jQuery.css( elem, "display" );
				showHide( [ elem ] );
			}
		}

		// Animate inline elements as inline-block
		if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
			if ( jQuery.css( elem, "float" ) === "none" ) {

				// Restore the original display value at the end of pure show/hide animations
				if ( !propTween ) {
					anim.done( function() {
						style.display = restoreDisplay;
					} );
					if ( restoreDisplay == null ) {
						display = style.display;
						restoreDisplay = display === "none" ? "" : display;
					}
				}
				style.display = "inline-block";
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always( function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		} );
	}

	// Implement show/hide animations
	propTween = false;
	for ( prop in orig ) {

		// General show/hide setup for this element animation
		if ( !propTween ) {
			if ( dataShow ) {
				if ( "hidden" in dataShow ) {
					hidden = dataShow.hidden;
				}
			} else {
				dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
			}

			// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
			if ( toggle ) {
				dataShow.hidden = !hidden;
			}

			// Show elements before animating them
			if ( hidden ) {
				showHide( [ elem ], true );
			}

			/* eslint-disable no-loop-func */

			anim.done( function() {

			/* eslint-enable no-loop-func */

				// The final step of a "hide" animation is actually hiding the element
				if ( !hidden ) {
					showHide( [ elem ] );
				}
				dataPriv.remove( elem, "fxshow" );
				for ( prop in orig ) {
					jQuery.style( elem, prop, orig[ prop ] );
				}
			} );
		}

		// Per-property setup
		propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
		if ( !( prop in dataShow ) ) {
			dataShow[ prop ] = propTween.start;
			if ( hidden ) {
				propTween.end = propTween.start;
				propTween.start = 0;
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( Array.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = Animation.prefilters.length,
		deferred = jQuery.Deferred().always( function() {

			// Don't match elem in the :animated selector
			delete tick.elem;
		} ),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

				// Support: Android 2.3 only
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ] );

			// If there's more to do, yield
			if ( percent < 1 && length ) {
				return remaining;
			}

			// If this was an empty animation, synthesize a final progress notification
			if ( !length ) {
				deferred.notifyWith( elem, [ animation, 1, 0 ] );
			}

			// Resolve the animation and report its conclusion
			deferred.resolveWith( elem, [ animation ] );
			return false;
		},
		animation = deferred.promise( {
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, {
				specialEasing: {},
				easing: jQuery.easing._default
			}, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,

					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.notifyWith( elem, [ animation, 1, 0 ] );
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		} ),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length; index++ ) {
		result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			if ( isFunction( result.stop ) ) {
				jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
					result.stop.bind( result );
			}
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	// Attach callbacks from options
	animation
		.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		} )
	);

	return animation;
}

jQuery.Animation = jQuery.extend( Animation, {

	tweeners: {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value );
			adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
			return tween;
		} ]
	},

	tweener: function( props, callback ) {
		if ( isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.match( rnothtmlwhite );
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length; index++ ) {
			prop = props[ index ];
			Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
			Animation.tweeners[ prop ].unshift( callback );
		}
	},

	prefilters: [ defaultPrefilter ],

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			Animation.prefilters.unshift( callback );
		} else {
			Animation.prefilters.push( callback );
		}
	}
} );

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !isFunction( easing ) && easing
	};

	// Go to the end state if fx are off
	if ( jQuery.fx.off ) {
		opt.duration = 0;

	} else {
		if ( typeof opt.duration !== "number" ) {
			if ( opt.duration in jQuery.fx.speeds ) {
				opt.duration = jQuery.fx.speeds[ opt.duration ];

			} else {
				opt.duration = jQuery.fx.speeds._default;
			}
		}
	}

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend( {
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate( { opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {

				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || dataPriv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue ) {
			this.queue( type || "fx", [] );
		}

		return this.each( function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = dataPriv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this &&
					( type == null || timers[ index ].queue === type ) ) {

					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		} );
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each( function() {
			var index,
				data = dataPriv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		} );
	}
} );

jQuery.each( [ "toggle", "show", "hide" ], function( _i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
} );

// Generate shortcuts for custom animations
jQuery.each( {
	slideDown: genFx( "show" ),
	slideUp: genFx( "hide" ),
	slideToggle: genFx( "toggle" ),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
} );

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = Date.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];

		// Run the timer and safely remove it when done (allowing for external removal)
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	jQuery.fx.start();
};

jQuery.fx.interval = 13;
jQuery.fx.start = function() {
	if ( inProgress ) {
		return;
	}

	inProgress = true;
	schedule();
};

jQuery.fx.stop = function() {
	inProgress = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,

	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// https://web.archive.org/web/20100324014747/http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = window.setTimeout( next, time );
		hooks.stop = function() {
			window.clearTimeout( timeout );
		};
	} );
};


( function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: Android <=4.3 only
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE <=11 only
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: IE <=11 only
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
} )();


var boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend( {
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each( function() {
			jQuery.removeAttr( this, name );
		} );
	}
} );

jQuery.extend( {
	attr: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set attributes on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		// Attribute hooks are determined by the lowercase version
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
		}

		if ( value !== undefined ) {
			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;
			}

			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			elem.setAttribute( name, value + "" );
			return value;
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		ret = jQuery.find.attr( elem, name );

		// Non-existent attributes return null, we normalize to undefined
		return ret == null ? undefined : ret;
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	removeAttr: function( elem, value ) {
		var name,
			i = 0,

			// Attribute names can contain non-HTML whitespace characters
			// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
			attrNames = value && value.match( rnothtmlwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( ( name = attrNames[ i++ ] ) ) {
				elem.removeAttribute( name );
			}
		}
	}
} );

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {

			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};

jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( _i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle,
			lowercaseName = name.toLowerCase();

		if ( !isXML ) {

			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ lowercaseName ];
			attrHandle[ lowercaseName ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				lowercaseName :
				null;
			attrHandle[ lowercaseName ] = handle;
		}
		return ret;
	};
} );




var rfocusable = /^(?:input|select|textarea|button)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend( {
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each( function() {
			delete this[ jQuery.propFix[ name ] || name ];
		} );
	}
} );

jQuery.extend( {
	prop: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			return ( elem[ name ] = value );
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		return elem[ name ];
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {

				// Support: IE <=9 - 11 only
				// elem.tabIndex doesn't always return the
				// correct value when it hasn't been explicitly set
				// https://web.archive.org/web/20141116233347/http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				if ( tabindex ) {
					return parseInt( tabindex, 10 );
				}

				if (
					rfocusable.test( elem.nodeName ) ||
					rclickable.test( elem.nodeName ) &&
					elem.href
				) {
					return 0;
				}

				return -1;
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	}
} );

// Support: IE <=11 only
// Accessing the selectedIndex property
// forces the browser to respect setting selected
// on the option
// The getter ensures a default option is selected
// when in an optgroup
// eslint rule "no-unused-expressions" is disabled for this code
// since it considers such accessions noop
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		},
		set: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent ) {
				parent.selectedIndex;

				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
		}
	};
}

jQuery.each( [
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
} );




	// Strip and collapse whitespace according to HTML spec
	// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
	function stripAndCollapse( value ) {
		var tokens = value.match( rnothtmlwhite ) || [];
		return tokens.join( " " );
	}


function getClass( elem ) {
	return elem.getAttribute && elem.getAttribute( "class" ) || "";
}

function classesToArray( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === "string" ) {
		return value.match( rnothtmlwhite ) || [];
	}
	return [];
}

jQuery.fn.extend( {
	addClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		if ( !arguments.length ) {
			return this.attr( "class", "" );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );

				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {

						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) > -1 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isValidValue = type === "string" || Array.isArray( value );

		if ( typeof stateVal === "boolean" && isValidValue ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( isFunction( value ) ) {
			return this.each( function( i ) {
				jQuery( this ).toggleClass(
					value.call( this, i, getClass( this ), stateVal ),
					stateVal
				);
			} );
		}

		return this.each( function() {
			var className, i, self, classNames;

			if ( isValidValue ) {

				// Toggle individual class names
				i = 0;
				self = jQuery( this );
				classNames = classesToArray( value );

				while ( ( className = classNames[ i++ ] ) ) {

					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( value === undefined || type === "boolean" ) {
				className = getClass( this );
				if ( className ) {

					// Store className if set
					dataPriv.set( this, "__className__", className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				if ( this.setAttribute ) {
					this.setAttribute( "class",
						className || value === false ?
						"" :
						dataPriv.get( this, "__className__" ) || ""
					);
				}
			}
		} );
	},

	hasClass: function( selector ) {
		var className, elem,
			i = 0;

		className = " " + selector + " ";
		while ( ( elem = this[ i++ ] ) ) {
			if ( elem.nodeType === 1 &&
				( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
					return true;
			}
		}

		return false;
	}
} );




var rreturn = /\r/g;

jQuery.fn.extend( {
	val: function( value ) {
		var hooks, ret, valueIsFunction,
			elem = this[ 0 ];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] ||
					jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks &&
					"get" in hooks &&
					( ret = hooks.get( elem, "value" ) ) !== undefined
				) {
					return ret;
				}

				ret = elem.value;

				// Handle most common string cases
				if ( typeof ret === "string" ) {
					return ret.replace( rreturn, "" );
				}

				// Handle cases where value is null/undef or number
				return ret == null ? "" : ret;
			}

			return;
		}

		valueIsFunction = isFunction( value );

		return this.each( function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( valueIsFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( Array.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				} );
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		} );
	}
} );

jQuery.extend( {
	valHooks: {
		option: {
			get: function( elem ) {

				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :

					// Support: IE <=10 - 11 only
					// option.text throws exceptions (#14686, #14858)
					// Strip and collapse whitespace
					// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
					stripAndCollapse( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option, i,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one",
					values = one ? null : [],
					max = one ? index + 1 : options.length;

				if ( index < 0 ) {
					i = max;

				} else {
					i = one ? index : 0;
				}

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// Support: IE <=9 only
					// IE8-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&

							// Don't return options that are disabled or in a disabled optgroup
							!option.disabled &&
							( !option.parentNode.disabled ||
								!nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					/* eslint-disable no-cond-assign */

					if ( option.selected =
						jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
					) {
						optionSet = true;
					}

					/* eslint-enable no-cond-assign */
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
} );

// Radios and checkboxes getter/setter
jQuery.each( [ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( Array.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute( "value" ) === null ? "on" : elem.value;
		};
	}
} );




// Return jQuery for attributes-only inclusion


support.focusin = "onfocusin" in window;


var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = (
					dataPriv.get( cur, "events" ) || Object.create( null )
				)[ event.type ] &&
				dataPriv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );


// Support: Firefox <=44
// Firefox doesn't have focus(in | out) events
// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
//
// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
// focus(in | out) events fire after focus & blur events,
// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
if ( !support.focusin ) {
	jQuery.each( { focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
			jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ) );
		};

		jQuery.event.special[ fix ] = {
			setup: function() {

				// Handle: regular nodes (via `this.ownerDocument`), window
				// (via `this.document`) & document (via `this`).
				var doc = this.ownerDocument || this.document || this,
					attaches = dataPriv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				dataPriv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this.document || this,
					attaches = dataPriv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					dataPriv.remove( doc, fix );

				} else {
					dataPriv.access( doc, fix, attaches );
				}
			}
		};
	} );
}
var location = window.location;

var nonce = { guid: Date.now() };

var rquery = ( /\?/ );



// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE 9 - 11 only
	// IE throws on parseFromString with invalid input.
	try {
		xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( Array.isArray( obj ) ) {

		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {

				// Treat each array item as a scalar.
				add( prefix, v );

			} else {

				// Item is non-scalar (array or object), encode its numeric index.
				buildParams(
					prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
					v,
					traditional,
					add
				);
			}
		} );

	} else if ( !traditional && toType( obj ) === "object" ) {

		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {

		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, valueOrFunction ) {

			// If value is a function, invoke it and use its return value
			var value = isFunction( valueOrFunction ) ?
				valueOrFunction() :
				valueOrFunction;

			s[ s.length ] = encodeURIComponent( key ) + "=" +
				encodeURIComponent( value == null ? "" : value );
		};

	if ( a == null ) {
		return "";
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		} );

	} else {

		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" );
};

jQuery.fn.extend( {
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map( function() {

			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		} )
		.filter( function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		} )
		.map( function( _i, elem ) {
			var val = jQuery( this ).val();

			if ( val == null ) {
				return null;
			}

			if ( Array.isArray( val ) ) {
				return jQuery.map( val, function( val ) {
					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
				} );
			}

			return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		} ).get();
	}
} );


var
	r20 = /%20/g,
	rhash = /#.*$/,
	rantiCache = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Anchor tag for parsing the document origin
	originAnchor = document.createElement( "a" );
	originAnchor.href = location.href;

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

		if ( isFunction( func ) ) {

			// For each dataType in the dataTypeExpression
			while ( ( dataType = dataTypes[ i++ ] ) ) {

				// Prepend if requested
				if ( dataType[ 0 ] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

				// Otherwise append
				} else {
					( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" &&
				!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		} );
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {

		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}

		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},

		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {

								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s.throws ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return {
								state: "parsererror",
								error: conv ? e : "No conversion from " + prev + " to " + current
							};
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend( {

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: location.href,
		type: "GET",
		isLocal: rlocalProtocol.test( location.protocol ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",

		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /\bxml\b/,
			html: /\bhtml/,
			json: /\bjson\b/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,

			// URL without anti-cache param
			cacheURL,

			// Response headers
			responseHeadersString,
			responseHeaders,

			// timeout handle
			timeoutTimer,

			// Url cleanup var
			urlAnchor,

			// Request state (becomes false upon send and true upon completion)
			completed,

			// To know if global events are to be dispatched
			fireGlobals,

			// Loop variable
			i,

			// uncached part of the url
			uncached,

			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),

			// Callbacks context
			callbackContext = s.context || s,

			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context &&
				( callbackContext.nodeType || callbackContext.jquery ) ?
					jQuery( callbackContext ) :
					jQuery.event,

			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),

			// Status-dependent callbacks
			statusCode = s.statusCode || {},

			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},

			// Default abort message
			strAbort = "canceled",

			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( completed ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
									( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
										.concat( match[ 2 ] );
							}
						}
						match = responseHeaders[ key.toLowerCase() + " " ];
					}
					return match == null ? null : match.join( ", " );
				},

				// Raw string
				getAllResponseHeaders: function() {
					return completed ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( completed == null ) {
						name = requestHeadersNames[ name.toLowerCase() ] =
							requestHeadersNames[ name.toLowerCase() ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( completed == null ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( completed ) {

							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						} else {

							// Lazy-add the new callbacks in a way that preserves old ones
							for ( code in map ) {
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR );

		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || location.href ) + "" )
			.replace( rprotocol, location.protocol + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

		// A cross-domain request is in order when the origin doesn't match the current origin.
		if ( s.crossDomain == null ) {
			urlAnchor = document.createElement( "a" );

			// Support: IE <=8 - 11, Edge 12 - 15
			// IE throws exception on accessing the href property if url is malformed,
			// e.g. http://example.com:80x/
			try {
				urlAnchor.href = s.url;

				// Support: IE <=8 - 11 only
				// Anchor's host property isn't correctly set when s.url is relative
				urlAnchor.href = urlAnchor.href;
				s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
					urlAnchor.protocol + "//" + urlAnchor.host;
			} catch ( e ) {

				// If there is an error parsing the URL, assume it is crossDomain,
				// it can be rejected by the transport if it is invalid
				s.crossDomain = true;
			}
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( completed ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		// Remove hash to simplify url manipulation
		cacheURL = s.url.replace( rhash, "" );

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// Remember the hash so we can put it back
			uncached = s.url.slice( cacheURL.length );

			// If data is available and should be processed, append data to url
			if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
				cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add or update anti-cache param if needed
			if ( s.cache === false ) {
				cacheURL = cacheURL.replace( rantiCache, "$1" );
				uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce.guid++ ) +
					uncached;
			}

			// Put hash and anti-cache on the URL that will be requested (gh-1732)
			s.url = cacheURL + uncached;

		// Change '%20' to '+' if this is encoded form body content (gh-2658)
		} else if ( s.data && s.processData &&
			( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
			s.data = s.data.replace( r20, "+" );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
				s.accepts[ s.dataTypes[ 0 ] ] +
					( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend &&
			( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		completeDeferred.add( s.complete );
		jqXHR.done( s.success );
		jqXHR.fail( s.error );

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}

			// If request was aborted inside ajaxSend, stop there
			if ( completed ) {
				return jqXHR;
			}

			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = window.setTimeout( function() {
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				completed = false;
				transport.send( requestHeaders, done );
			} catch ( e ) {

				// Rethrow post-completion exceptions
				if ( completed ) {
					throw e;
				}

				// Propagate others as results
				done( -1, e );
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Ignore repeat invocations
			if ( completed ) {
				return;
			}

			completed = true;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				window.clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Use a noop converter for missing script
			if ( !isSuccess && jQuery.inArray( "script", s.dataTypes ) > -1 ) {
				s.converters[ "text script" ] = function() {};
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader( "Last-Modified" );
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader( "etag" );
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {

				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
} );

jQuery.each( [ "get", "post" ], function( _i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {

		// Shift arguments if data argument was omitted
		if ( isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		// The url can be an options object (which then must have .url)
		return jQuery.ajax( jQuery.extend( {
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		}, jQuery.isPlainObject( url ) && url ) );
	};
} );

jQuery.ajaxPrefilter( function( s ) {
	var i;
	for ( i in s.headers ) {
		if ( i.toLowerCase() === "content-type" ) {
			s.contentType = s.headers[ i ] || "";
		}
	}
} );


jQuery._evalUrl = function( url, options, doc ) {
	return jQuery.ajax( {
		url: url,

		// Make this explicit, since user can override this through ajaxSetup (#11264)
		type: "GET",
		dataType: "script",
		cache: true,
		async: false,
		global: false,

		// Only evaluate the response if it is successful (gh-4126)
		// dataFilter is not invoked for failure responses, so using it instead
		// of the default converter is kludgy but it works.
		converters: {
			"text script": function() {}
		},
		dataFilter: function( response ) {
			jQuery.globalEval( response, options, doc );
		}
	} );
};


jQuery.fn.extend( {
	wrapAll: function( html ) {
		var wrap;

		if ( this[ 0 ] ) {
			if ( isFunction( html ) ) {
				html = html.call( this[ 0 ] );
			}

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map( function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			} ).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( isFunction( html ) ) {
			return this.each( function( i ) {
				jQuery( this ).wrapInner( html.call( this, i ) );
			} );
		}

		return this.each( function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		} );
	},

	wrap: function( html ) {
		var htmlIsFunction = isFunction( html );

		return this.each( function( i ) {
			jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
		} );
	},

	unwrap: function( selector ) {
		this.parent( selector ).not( "body" ).each( function() {
			jQuery( this ).replaceWith( this.childNodes );
		} );
		return this;
	}
} );


jQuery.expr.pseudos.hidden = function( elem ) {
	return !jQuery.expr.pseudos.visible( elem );
};
jQuery.expr.pseudos.visible = function( elem ) {
	return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
};




jQuery.ajaxSettings.xhr = function() {
	try {
		return new window.XMLHttpRequest();
	} catch ( e ) {}
};

var xhrSuccessStatus = {

		// File protocol always yields status code 0, assume 200
		0: 200,

		// Support: IE <=9 only
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport( function( options ) {
	var callback, errorCallback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr();

				xhr.open(
					options.type,
					options.url,
					options.async,
					options.username,
					options.password
				);

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
					headers[ "X-Requested-With" ] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							callback = errorCallback = xhr.onload =
								xhr.onerror = xhr.onabort = xhr.ontimeout =
									xhr.onreadystatechange = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {

								// Support: IE <=9 only
								// On a manual native abort, IE9 throws
								// errors on any property access that is not readyState
								if ( typeof xhr.status !== "number" ) {
									complete( 0, "error" );
								} else {
									complete(

										// File: protocol always yields status 0; see #8605, #14207
										xhr.status,
										xhr.statusText
									);
								}
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,

									// Support: IE <=9 only
									// IE9 has no XHR2 but throws on binary (trac-11426)
									// For XHR2 non-text, let the caller handle it (gh-2498)
									( xhr.responseType || "text" ) !== "text"  ||
									typeof xhr.responseText !== "string" ?
										{ binary: xhr.response } :
										{ text: xhr.responseText },
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

				// Support: IE 9 only
				// Use onreadystatechange to replace onabort
				// to handle uncaught aborts
				if ( xhr.onabort !== undefined ) {
					xhr.onabort = errorCallback;
				} else {
					xhr.onreadystatechange = function() {

						// Check readyState before timeout as it changes
						if ( xhr.readyState === 4 ) {

							// Allow onerror to be called first,
							// but that will not handle a native abort
							// Also, save errorCallback to a variable
							// as xhr.onerror cannot be accessed
							window.setTimeout( function() {
								if ( callback ) {
									errorCallback();
								}
							} );
						}
					};
				}

				// Create the abort callback
				callback = callback( "abort" );

				try {

					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {

					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
jQuery.ajaxPrefilter( function( s ) {
	if ( s.crossDomain ) {
		s.contents.script = false;
	}
} );

// Install script dataType
jQuery.ajaxSetup( {
	accepts: {
		script: "text/javascript, application/javascript, " +
			"application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /\b(?:java|ecma)script\b/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
} );

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
} );

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {

	// This transport only deals with cross domain or forced-by-attrs requests
	if ( s.crossDomain || s.scriptAttrs ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery( "<script>" )
					.attr( s.scriptAttrs || {} )
					.prop( { charset: s.scriptCharset, src: s.url } )
					.on( "load error", callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					} );

				// Use native DOM manipulation to avoid our domManip AJAX trickery
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup( {
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce.guid++ ) );
		this[ callback ] = true;
		return callback;
	}
} );

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" &&
				( s.contentType || "" )
					.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
				rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters[ "script json" ] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// Force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always( function() {

			// If previous value didn't exist - remove it
			if ( overwritten === undefined ) {
				jQuery( window ).removeProp( callbackName );

			// Otherwise restore preexisting value
			} else {
				window[ callbackName ] = overwritten;
			}

			// Save back as free
			if ( s[ callbackName ] ) {

				// Make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// Save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		} );

		// Delegate to script
		return "script";
	}
} );




// Support: Safari 8 only
// In Safari 8 documents created via document.implementation.createHTMLDocument
// collapse sibling forms: the second one becomes a child of the first one.
// Because of that, this security measure has to be disabled in Safari 8.
// https://bugs.webkit.org/show_bug.cgi?id=137337
support.createHTMLDocument = ( function() {
	var body = document.implementation.createHTMLDocument( "" ).body;
	body.innerHTML = "<form></form><form></form>";
	return body.childNodes.length === 2;
} )();


// Argument "data" should be string of html
// context (optional): If specified, the fragment will be created in this context,
// defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( typeof data !== "string" ) {
		return [];
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}

	var base, parsed, scripts;

	if ( !context ) {

		// Stop scripts or inline event handlers from being executed immediately
		// by using document.implementation
		if ( support.createHTMLDocument ) {
			context = document.implementation.createHTMLDocument( "" );

			// Set the base href for the created document
			// so any parsed elements with URLs
			// are based on the document's URL (gh-2965)
			base = context.createElement( "base" );
			base.href = document.location.href;
			context.head.appendChild( base );
		} else {
			context = document;
		}
	}

	parsed = rsingleTag.exec( data );
	scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[ 1 ] ) ];
	}

	parsed = buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	var selector, type, response,
		self = this,
		off = url.indexOf( " " );

	if ( off > -1 ) {
		selector = stripAndCollapse( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax( {
			url: url,

			// If "type" variable is undefined, then "GET" method will be used.
			// Make value of this field explicit since
			// user can override it through ajaxSetup method
			type: type || "GET",
			dataType: "html",
			data: params
		} ).done( function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		// If the request succeeds, this function gets "data", "status", "jqXHR"
		// but they are ignored because response was set above.
		// If it fails, this function gets "jqXHR", "status", "error"
		} ).always( callback && function( jqXHR, status ) {
			self.each( function() {
				callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
			} );
		} );
	}

	return this;
};




jQuery.expr.pseudos.animated = function( elem ) {
	return jQuery.grep( jQuery.timers, function( fn ) {
		return elem === fn.elem;
	} ).length;
};




jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( isFunction( options ) ) {

			// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
			options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			if ( typeof props.top === "number" ) {
				props.top += "px";
			}
			if ( typeof props.left === "number" ) {
				props.left += "px";
			}
			curElem.css( props );
		}
	}
};

jQuery.fn.extend( {

	// offset() relates an element's border box to the document origin
	offset: function( options ) {

		// Preserve chaining for setter
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each( function( i ) {
					jQuery.offset.setOffset( this, options, i );
				} );
		}

		var rect, win,
			elem = this[ 0 ];

		if ( !elem ) {
			return;
		}

		// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
		// Support: IE <=11 only
		// Running getBoundingClientRect on a
		// disconnected node in IE throws an error
		if ( !elem.getClientRects().length ) {
			return { top: 0, left: 0 };
		}

		// Get document-relative position by adding viewport scroll to viewport-relative gBCR
		rect = elem.getBoundingClientRect();
		win = elem.ownerDocument.defaultView;
		return {
			top: rect.top + win.pageYOffset,
			left: rect.left + win.pageXOffset
		};
	},

	// position() relates an element's margin box to its offset parent's padding box
	// This corresponds to the behavior of CSS absolute positioning
	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset, doc,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// position:fixed elements are offset from the viewport, which itself always has zero offset
		if ( jQuery.css( elem, "position" ) === "fixed" ) {

			// Assume position:fixed implies availability of getBoundingClientRect
			offset = elem.getBoundingClientRect();

		} else {
			offset = this.offset();

			// Account for the *real* offset parent, which can be the document or its root element
			// when a statically positioned element is identified
			doc = elem.ownerDocument;
			offsetParent = elem.offsetParent || doc.documentElement;
			while ( offsetParent &&
				( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
				jQuery.css( offsetParent, "position" ) === "static" ) {

				offsetParent = offsetParent.parentNode;
			}
			if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

				// Incorporate borders into its offset, since they are outside its content origin
				parentOffset = jQuery( offsetParent ).offset();
				parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
				parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
			}
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	// This method will return documentElement in the following cases:
	// 1) For the element inside the iframe without offsetParent, this method will return
	//    documentElement of the parent window
	// 2) For the hidden or detached element
	// 3) For body or html element, i.e. in case of the html node - it will return itself
	//
	// but those exceptions were never presented as a real life use-cases
	// and might be considered as more preferable results.
	//
	// This logic, however, is not guaranteed and can change at any point in the future
	offsetParent: function() {
		return this.map( function() {
			var offsetParent = this.offsetParent;

			while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || documentElement;
		} );
	}
} );

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {

			// Coalesce documents and windows
			var win;
			if ( isWindow( elem ) ) {
				win = elem;
			} else if ( elem.nodeType === 9 ) {
				win = elem.defaultView;
			}

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : win.pageXOffset,
					top ? val : win.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length );
	};
} );

// Support: Safari <=7 - 9.1, Chrome <=37 - 49
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( _i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );

				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
} );


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name },
		function( defaultExtra, funcName ) {

		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( isWindow( elem ) ) {

					// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
					return funcName.indexOf( "outer" ) === 0 ?
						elem[ "inner" + name ] :
						elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?

					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable );
		};
	} );
} );


jQuery.each( [
	"ajaxStart",
	"ajaxStop",
	"ajaxComplete",
	"ajaxError",
	"ajaxSuccess",
	"ajaxSend"
], function( _i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
} );




jQuery.fn.extend( {

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {

		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ?
			this.off( selector, "**" ) :
			this.off( types, selector || "**", fn );
	},

	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
} );

jQuery.each( ( "blur focus focusin focusout resize scroll click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup contextmenu" ).split( " " ),
	function( _i, name ) {

		// Handle event binding
		jQuery.fn[ name ] = function( data, fn ) {
			return arguments.length > 0 ?
				this.on( name, null, data, fn ) :
				this.trigger( name );
		};
	} );




// Support: Android <=4.0 only
// Make sure we trim BOM and NBSP
var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

// Bind a function to a context, optionally partially applying any
// arguments.
// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
// However, it is not slated for removal any time soon
jQuery.proxy = function( fn, context ) {
	var tmp, args, proxy;

	if ( typeof context === "string" ) {
		tmp = fn[ context ];
		context = fn;
		fn = tmp;
	}

	// Quick check to determine if target is callable, in the spec
	// this throws a TypeError, but we will just return undefined.
	if ( !isFunction( fn ) ) {
		return undefined;
	}

	// Simulated bind
	args = slice.call( arguments, 2 );
	proxy = function() {
		return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
	};

	// Set the guid of unique handler to the same of original handler, so it can be removed
	proxy.guid = fn.guid = fn.guid || jQuery.guid++;

	return proxy;
};

jQuery.holdReady = function( hold ) {
	if ( hold ) {
		jQuery.readyWait++;
	} else {
		jQuery.ready( true );
	}
};
jQuery.isArray = Array.isArray;
jQuery.parseJSON = JSON.parse;
jQuery.nodeName = nodeName;
jQuery.isFunction = isFunction;
jQuery.isWindow = isWindow;
jQuery.camelCase = camelCase;
jQuery.type = toType;

jQuery.now = Date.now;

jQuery.isNumeric = function( obj ) {

	// As of jQuery 3.0, isNumeric is limited to
	// strings and numbers (primitives or objects)
	// that can be coerced to finite numbers (gh-2662)
	var type = jQuery.type( obj );
	return ( type === "number" || type === "string" ) &&

		// parseFloat NaNs numeric-cast false positives ("")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		!isNaN( obj - parseFloat( obj ) );
};

jQuery.trim = function( text ) {
	return text == null ?
		"" :
		( text + "" ).replace( rtrim, "" );
};



// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	} );
}




var

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === "undefined" ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;
} );

},{}],4:[function(require,module,exports){
(function (global){(function (){
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["Twig"] = factory();
	else
		root["Twig"] = factory();
})(global, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 7);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {
    "default": obj
  };
}

module.exports = _interopRequireDefault;

/***/ }),
/* 1 */
/***/ (function(module, exports) {

function _typeof(obj) {
  "@babel/helpers - typeof";

  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    module.exports = _typeof = function _typeof(obj) {
      return typeof obj;
    };
  } else {
    module.exports = _typeof = function _typeof(obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
    };
  }

  return _typeof(obj);
}

module.exports = _typeof;

/***/ }),
/* 2 */
/***/ (function(module, exports) {

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

module.exports = _defineProperty;

/***/ }),
/* 3 */
/***/ (function(module, exports) {

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) {
    arr2[i] = arr[i];
  }

  return arr2;
}

module.exports = _arrayLikeToArray;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function sprintf() {
  //  discuss at: https://locutus.io/php/sprintf/
  // original by: Ash Searle (https://hexmen.com/blog/)
  // improved by: Michael White (https://getsprink.com)
  // improved by: Jack
  // improved by: Kevin van Zonneveld (https://kvz.io)
  // improved by: Kevin van Zonneveld (https://kvz.io)
  // improved by: Kevin van Zonneveld (https://kvz.io)
  // improved by: Dj
  // improved by: Allidylls
  //    input by: Paulo Freitas
  //    input by: Brett Zamir (https://brett-zamir.me)
  // improved by: Rafał Kukawski (https://kukawski.pl)
  //   example 1: sprintf("%01.2f", 123.1)
  //   returns 1: '123.10'
  //   example 2: sprintf("[%10s]", 'monkey')
  //   returns 2: '[    monkey]'
  //   example 3: sprintf("[%'#10s]", 'monkey')
  //   returns 3: '[####monkey]'
  //   example 4: sprintf("%d", 123456789012345)
  //   returns 4: '123456789012345'
  //   example 5: sprintf('%-03s', 'E')
  //   returns 5: 'E00'
  //   example 6: sprintf('%+010d', 9)
  //   returns 6: '+000000009'
  //   example 7: sprintf('%+0\'@10d', 9)
  //   returns 7: '@@@@@@@@+9'
  //   example 8: sprintf('%.f', 3.14)
  //   returns 8: '3.140000'
  //   example 9: sprintf('%% %2$d', 1, 2)
  //   returns 9: '% 2'

  var regex = /%%|%(?:(\d+)\$)?((?:[-+#0 ]|'[\s\S])*)(\d+)?(?:\.(\d*))?([\s\S])/g;
  var args = arguments;
  var i = 0;
  var format = args[i++];

  var _pad = function _pad(str, len, chr, leftJustify) {
    if (!chr) {
      chr = ' ';
    }
    var padding = str.length >= len ? '' : new Array(1 + len - str.length >>> 0).join(chr);
    return leftJustify ? str + padding : padding + str;
  };

  var justify = function justify(value, prefix, leftJustify, minWidth, padChar) {
    var diff = minWidth - value.length;
    if (diff > 0) {
      // when padding with zeros
      // on the left side
      // keep sign (+ or -) in front
      if (!leftJustify && padChar === '0') {
        value = [value.slice(0, prefix.length), _pad('', diff, '0', true), value.slice(prefix.length)].join('');
      } else {
        value = _pad(value, minWidth, padChar, leftJustify);
      }
    }
    return value;
  };

  var _formatBaseX = function _formatBaseX(value, base, leftJustify, minWidth, precision, padChar) {
    // Note: casts negative numbers to positive ones
    var number = value >>> 0;
    value = _pad(number.toString(base), precision || 0, '0', false);
    return justify(value, '', leftJustify, minWidth, padChar);
  };

  // _formatString()
  var _formatString = function _formatString(value, leftJustify, minWidth, precision, customPadChar) {
    if (precision !== null && precision !== undefined) {
      value = value.slice(0, precision);
    }
    return justify(value, '', leftJustify, minWidth, customPadChar);
  };

  // doFormat()
  var doFormat = function doFormat(substring, argIndex, modifiers, minWidth, precision, specifier) {
    var number, prefix, method, textTransform, value;

    if (substring === '%%') {
      return '%';
    }

    // parse modifiers
    var padChar = ' '; // pad with spaces by default
    var leftJustify = false;
    var positiveNumberPrefix = '';
    var j, l;

    for (j = 0, l = modifiers.length; j < l; j++) {
      switch (modifiers.charAt(j)) {
        case ' ':
        case '0':
          padChar = modifiers.charAt(j);
          break;
        case '+':
          positiveNumberPrefix = '+';
          break;
        case '-':
          leftJustify = true;
          break;
        case "'":
          if (j + 1 < l) {
            padChar = modifiers.charAt(j + 1);
            j++;
          }
          break;
      }
    }

    if (!minWidth) {
      minWidth = 0;
    } else {
      minWidth = +minWidth;
    }

    if (!isFinite(minWidth)) {
      throw new Error('Width must be finite');
    }

    if (!precision) {
      precision = specifier === 'd' ? 0 : 'fFeE'.indexOf(specifier) > -1 ? 6 : undefined;
    } else {
      precision = +precision;
    }

    if (argIndex && +argIndex === 0) {
      throw new Error('Argument number must be greater than zero');
    }

    if (argIndex && +argIndex >= args.length) {
      throw new Error('Too few arguments');
    }

    value = argIndex ? args[+argIndex] : args[i++];

    switch (specifier) {
      case '%':
        return '%';
      case 's':
        return _formatString(value + '', leftJustify, minWidth, precision, padChar);
      case 'c':
        return _formatString(String.fromCharCode(+value), leftJustify, minWidth, precision, padChar);
      case 'b':
        return _formatBaseX(value, 2, leftJustify, minWidth, precision, padChar);
      case 'o':
        return _formatBaseX(value, 8, leftJustify, minWidth, precision, padChar);
      case 'x':
        return _formatBaseX(value, 16, leftJustify, minWidth, precision, padChar);
      case 'X':
        return _formatBaseX(value, 16, leftJustify, minWidth, precision, padChar).toUpperCase();
      case 'u':
        return _formatBaseX(value, 10, leftJustify, minWidth, precision, padChar);
      case 'i':
      case 'd':
        number = +value || 0;
        // Plain Math.round doesn't just truncate
        number = Math.round(number - number % 1);
        prefix = number < 0 ? '-' : positiveNumberPrefix;
        value = prefix + _pad(String(Math.abs(number)), precision, '0', false);

        if (leftJustify && padChar === '0') {
          // can't right-pad 0s on integers
          padChar = ' ';
        }
        return justify(value, prefix, leftJustify, minWidth, padChar);
      case 'e':
      case 'E':
      case 'f': // @todo: Should handle locales (as per setlocale)
      case 'F':
      case 'g':
      case 'G':
        number = +value;
        prefix = number < 0 ? '-' : positiveNumberPrefix;
        method = ['toExponential', 'toFixed', 'toPrecision']['efg'.indexOf(specifier.toLowerCase())];
        textTransform = ['toString', 'toUpperCase']['eEfFgG'.indexOf(specifier) % 2];
        value = prefix + Math.abs(number)[method](precision);
        return justify(value, prefix, leftJustify, minWidth, padChar)[textTransform]();
      default:
        // unknown specifier, consume that char and return empty
        return '';
    }
  };

  try {
    return format.replace(regex, doFormat);
  } catch (err) {
    return false;
  }
};


/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function _php_cast_int(value) {
  // eslint-disable-line camelcase
  // original by: Rafał Kukawski
  //   example 1: _php_cast_int(false)
  //   returns 1: 0
  //   example 2: _php_cast_int(true)
  //   returns 2: 1
  //   example 3: _php_cast_int(0)
  //   returns 3: 0
  //   example 4: _php_cast_int(1)
  //   returns 4: 1
  //   example 5: _php_cast_int(3.14)
  //   returns 5: 3
  //   example 6: _php_cast_int('')
  //   returns 6: 0
  //   example 7: _php_cast_int('0')
  //   returns 7: 0
  //   example 8: _php_cast_int('abc')
  //   returns 8: 0
  //   example 9: _php_cast_int(null)
  //   returns 9: 0
  //  example 10: _php_cast_int(undefined)
  //  returns 10: 0
  //  example 11: _php_cast_int('123abc')
  //  returns 11: 123
  //  example 12: _php_cast_int('123e4')
  //  returns 12: 123
  //  example 13: _php_cast_int(0x200000001)
  //  returns 13: 8589934593

  var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);

  switch (type) {
    case 'number':
      if (isNaN(value) || !isFinite(value)) {
        // from PHP 7, NaN and Infinity are casted to 0
        return 0;
      }

      return value < 0 ? Math.ceil(value) : Math.floor(value);
    case 'string':
      return parseInt(value, 10) || 0;
    case 'boolean':
    // fall through
    default:
      // Behaviour for types other than float, string, boolean
      // is undefined and can change any time.
      // To not invent complex logic
      // that mimics PHP 7.0 behaviour
      // casting value->bool->number is used
      return +!!value;
  }
};


/***/ }),
/* 6 */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


/**
 * Twig.js
 *
 * @copyright 2011-2020 John Roepke and the Twig.js Contributors
 * @license   Available under the BSD 2-Clause License
 * @link      https://github.com/twigjs/twig.js
 */
module.exports = __webpack_require__(8)();

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.factory.js
//
// This file handles creating the Twig library
module.exports = function factory() {
  var Twig = {
    VERSION: '1.14.0'
  };

  __webpack_require__(9)(Twig);

  __webpack_require__(10)(Twig);

  __webpack_require__(11)(Twig);

  __webpack_require__(18)(Twig);

  __webpack_require__(19)(Twig);

  __webpack_require__(20)(Twig);

  __webpack_require__(31)(Twig);

  __webpack_require__(32)(Twig);

  __webpack_require__(34)(Twig);

  __webpack_require__(35)(Twig);

  __webpack_require__(36)(Twig);

  __webpack_require__(37)(Twig);

  __webpack_require__(38)(Twig);

  __webpack_require__(39)(Twig);

  __webpack_require__(40)(Twig);

  Twig.exports.factory = factory;
  return Twig.exports;
};

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _defineProperty2 = _interopRequireDefault(__webpack_require__(2));

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { (0, _defineProperty2["default"])(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

// ## twig.core.js
//
// This file handles template level tokenizing, compiling and parsing.
module.exports = function (Twig) {
  'use strict';

  Twig.trace = false;
  Twig.debug = false; // Default caching to true for the improved performance it offers

  Twig.cache = true;

  Twig.noop = function () {};

  Twig.merge = function (target, source, onlyChanged) {
    Object.keys(source).forEach(function (key) {
      if (onlyChanged && !(key in target)) {
        return;
      }

      target[key] = source[key];
    });
    return target;
  };
  /**
   * Exception thrown by twig.js.
   */


  Twig.Error = function (message, file) {
    this.message = message;
    this.name = 'TwigException';
    this.type = 'TwigException';
    this.file = file;
  };
  /**
   * Get the string representation of a Twig error.
   */


  Twig.Error.prototype.toString = function () {
    var output = this.name + ': ' + this.message;
    return output;
  };
  /**
   * Wrapper for logging to the console.
   */


  Twig.log = {
    trace: function trace() {
      if (Twig.trace && console) {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        console.log(Array.prototype.slice.call(args));
      }
    },
    debug: function debug() {
      if (Twig.debug && console) {
        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }

        console.log(Array.prototype.slice.call(args));
      }
    }
  };

  if (typeof console === 'undefined') {
    Twig.log.error = function () {};
  } else if (typeof console.error !== 'undefined') {
    Twig.log.error = function () {
      var _console;

      (_console = console).error.apply(_console, arguments);
    };
  } else if (typeof console.log !== 'undefined') {
    Twig.log.error = function () {
      var _console2;

      (_console2 = console).log.apply(_console2, arguments);
    };
  }
  /**
   * Container for methods related to handling high level template tokens
   *      (for example: {{ expression }}, {% logic %}, {# comment #}, raw data)
   */


  Twig.token = {};
  /**
   * Token types.
   */

  Twig.token.type = {
    output: 'output',
    logic: 'logic',
    comment: 'comment',
    raw: 'raw',
    outputWhitespacePre: 'output_whitespace_pre',
    outputWhitespacePost: 'output_whitespace_post',
    outputWhitespaceBoth: 'output_whitespace_both',
    logicWhitespacePre: 'logic_whitespace_pre',
    logicWhitespacePost: 'logic_whitespace_post',
    logicWhitespaceBoth: 'logic_whitespace_both'
  };
  /**
   * Token syntax definitions.
   */

  Twig.token.definitions = [{
    type: Twig.token.type.raw,
    open: '{% raw %}',
    close: '{% endraw %}'
  }, {
    type: Twig.token.type.raw,
    open: '{% verbatim %}',
    close: '{% endverbatim %}'
  }, // *Whitespace type tokens*
  //
  // These typically take the form `{{- expression -}}` or `{{- expression }}` or `{{ expression -}}`.
  {
    type: Twig.token.type.outputWhitespacePre,
    open: '{{-',
    close: '}}'
  }, {
    type: Twig.token.type.outputWhitespacePost,
    open: '{{',
    close: '-}}'
  }, {
    type: Twig.token.type.outputWhitespaceBoth,
    open: '{{-',
    close: '-}}'
  }, {
    type: Twig.token.type.logicWhitespacePre,
    open: '{%-',
    close: '%}'
  }, {
    type: Twig.token.type.logicWhitespacePost,
    open: '{%',
    close: '-%}'
  }, {
    type: Twig.token.type.logicWhitespaceBoth,
    open: '{%-',
    close: '-%}'
  }, // *Output type tokens*
  //
  // These typically take the form `{{ expression }}`.
  {
    type: Twig.token.type.output,
    open: '{{',
    close: '}}'
  }, // *Logic type tokens*
  //
  // These typically take a form like `{% if expression %}` or `{% endif %}`
  {
    type: Twig.token.type.logic,
    open: '{%',
    close: '%}'
  }, // *Comment type tokens*
  //
  // These take the form `{# anything #}`
  {
    type: Twig.token.type.comment,
    open: '{#',
    close: '#}'
  }];
  /**
   * What characters start "strings" in token definitions. We need this to ignore token close
   * strings inside an expression.
   */

  Twig.token.strings = ['"', '\''];

  Twig.token.findStart = function (template) {
    var output = {
      position: null,
      def: null
    };
    var closePosition = null;
    var len = Twig.token.definitions.length;
    var i;
    var tokenTemplate;
    var firstKeyPosition;
    var closeKeyPosition;

    for (i = 0; i < len; i++) {
      tokenTemplate = Twig.token.definitions[i];
      firstKeyPosition = template.indexOf(tokenTemplate.open);
      closeKeyPosition = template.indexOf(tokenTemplate.close);
      Twig.log.trace('Twig.token.findStart: ', 'Searching for ', tokenTemplate.open, ' found at ', firstKeyPosition); // Special handling for mismatched tokens

      if (firstKeyPosition >= 0) {
        // This token matches the template
        if (tokenTemplate.open.length !== tokenTemplate.close.length) {
          // This token has mismatched closing and opening tags
          if (closeKeyPosition < 0) {
            // This token's closing tag does not match the template
            continue;
          }
        }
      } // Does this token occur before any other types?


      if (firstKeyPosition >= 0 && (output.position === null || firstKeyPosition < output.position)) {
        output.position = firstKeyPosition;
        output.def = tokenTemplate;
        closePosition = closeKeyPosition;
      } else if (firstKeyPosition >= 0 && output.position !== null && firstKeyPosition === output.position) {
        /* This token exactly matches another token,
        greedily match to check if this token has a greater specificity */
        if (tokenTemplate.open.length > output.def.open.length) {
          // This token's opening tag is more specific than the previous match
          output.position = firstKeyPosition;
          output.def = tokenTemplate;
          closePosition = closeKeyPosition;
        } else if (tokenTemplate.open.length === output.def.open.length) {
          if (tokenTemplate.close.length > output.def.close.length) {
            // This token's opening tag is as specific as the previous match,
            // but the closing tag has greater specificity
            if (closeKeyPosition >= 0 && closeKeyPosition < closePosition) {
              // This token's closing tag exists in the template,
              // and it occurs sooner than the previous match
              output.position = firstKeyPosition;
              output.def = tokenTemplate;
              closePosition = closeKeyPosition;
            }
          } else if (closeKeyPosition >= 0 && closeKeyPosition < closePosition) {
            // This token's closing tag is not more specific than the previous match,
            // but it occurs sooner than the previous match
            output.position = firstKeyPosition;
            output.def = tokenTemplate;
            closePosition = closeKeyPosition;
          }
        }
      }
    }

    return output;
  };

  Twig.token.findEnd = function (template, tokenDef, start) {
    var end = null;
    var found = false;
    var offset = 0; // String position variables

    var strPos = null;
    var strFound = null;
    var pos = null;
    var endOffset = null;
    var thisStrPos = null;
    var endStrPos = null; // For loop variables

    var i;
    var l;

    while (!found) {
      strPos = null;
      strFound = null;
      pos = template.indexOf(tokenDef.close, offset);

      if (pos >= 0) {
        end = pos;
        found = true;
      } else {
        // Throw an exception
        throw new Twig.Error('Unable to find closing bracket \'' + tokenDef.close + '\' opened near template position ' + start);
      } // Ignore quotes within comments; just look for the next comment close sequence,
      // regardless of what comes before it. https://github.com/justjohn/twig.js/issues/95


      if (tokenDef.type === Twig.token.type.comment) {
        break;
      } // Ignore quotes within raw tag
      // Fixes #283


      if (tokenDef.type === Twig.token.type.raw) {
        break;
      }

      l = Twig.token.strings.length;

      for (i = 0; i < l; i += 1) {
        thisStrPos = template.indexOf(Twig.token.strings[i], offset);

        if (thisStrPos > 0 && thisStrPos < pos && (strPos === null || thisStrPos < strPos)) {
          strPos = thisStrPos;
          strFound = Twig.token.strings[i];
        }
      } // We found a string before the end of the token, now find the string's end and set the search offset to it


      if (strPos !== null) {
        endOffset = strPos + 1;
        end = null;
        found = false;

        for (;;) {
          endStrPos = template.indexOf(strFound, endOffset);

          if (endStrPos < 0) {
            throw Twig.Error('Unclosed string in template');
          } // Ignore escaped quotes


          if (template.slice(endStrPos - 1, endStrPos) === '\\') {
            endOffset = endStrPos + 1;
          } else {
            offset = endStrPos + 1;
            break;
          }
        }
      }
    }

    return end;
  };
  /**
   * Convert a template into high-level tokens.
   */


  Twig.tokenize = function (template) {
    var tokens = []; // An offset for reporting errors locations in the template.

    var errorOffset = 0; // The start and type of the first token found in the template.

    var foundToken = null; // The end position of the matched token.

    var end = null;

    while (template.length > 0) {
      // Find the first occurance of any token type in the template
      foundToken = Twig.token.findStart(template);
      Twig.log.trace('Twig.tokenize: ', 'Found token: ', foundToken);

      if (foundToken.position === null) {
        // No more tokens -> add the rest of the template as a raw-type token
        tokens.push({
          type: Twig.token.type.raw,
          value: template
        });
        template = '';
      } else {
        // Add a raw type token for anything before the start of the token
        if (foundToken.position > 0) {
          tokens.push({
            type: Twig.token.type.raw,
            value: template.slice(0, Math.max(0, foundToken.position))
          });
        }

        template = template.slice(foundToken.position + foundToken.def.open.length);
        errorOffset += foundToken.position + foundToken.def.open.length; // Find the end of the token

        end = Twig.token.findEnd(template, foundToken.def, errorOffset);
        Twig.log.trace('Twig.tokenize: ', 'Token ends at ', end);
        tokens.push({
          type: foundToken.def.type,
          value: template.slice(0, Math.max(0, end)).trim()
        });

        if (template.slice(end + foundToken.def.close.length, end + foundToken.def.close.length + 1) === '\n') {
          switch (foundToken.def.type) {
            case 'logic_whitespace_pre':
            case 'logic_whitespace_post':
            case 'logic_whitespace_both':
            case 'logic':
              // Newlines directly after logic tokens are ignored
              end += 1;
              break;

            default:
              break;
          }
        }

        template = template.slice(end + foundToken.def.close.length); // Increment the position in the template

        errorOffset += end + foundToken.def.close.length;
      }
    }

    return tokens;
  };

  Twig.compile = function (tokens) {
    var self = this;

    try {
      // Output and intermediate stacks
      var output = [];
      var stack = []; // The tokens between open and close tags

      var intermediateOutput = [];
      var token = null;
      var logicToken = null;
      var unclosedToken = null; // Temporary previous token.

      var prevToken = null; // Temporary previous output.

      var prevOutput = null; // Temporary previous intermediate output.

      var prevIntermediateOutput = null; // The previous token's template

      var prevTemplate = null; // Token lookahead

      var nextToken = null; // The output token

      var tokOutput = null; // Logic Token values

      var type = null;
      var open = null;
      var next = null;

      var compileOutput = function compileOutput(token) {
        Twig.expression.compile.call(self, token);

        if (stack.length > 0) {
          intermediateOutput.push(token);
        } else {
          output.push(token);
        }
      };

      var compileLogic = function compileLogic(token) {
        // Compile the logic token
        logicToken = Twig.logic.compile.call(self, token);
        type = logicToken.type;
        open = Twig.logic.handler[type].open;
        next = Twig.logic.handler[type].next;
        Twig.log.trace('Twig.compile: ', 'Compiled logic token to ', logicToken, ' next is: ', next, ' open is : ', open); // Not a standalone token, check logic stack to see if this is expected

        if (open !== undefined && !open) {
          prevToken = stack.pop();
          prevTemplate = Twig.logic.handler[prevToken.type];

          if (!prevTemplate.next.includes(type)) {
            throw new Error(type + ' not expected after a ' + prevToken.type);
          }

          prevToken.output = prevToken.output || [];
          prevToken.output = prevToken.output.concat(intermediateOutput);
          intermediateOutput = [];
          tokOutput = {
            type: Twig.token.type.logic,
            token: prevToken
          };

          if (stack.length > 0) {
            intermediateOutput.push(tokOutput);
          } else {
            output.push(tokOutput);
          }
        } // This token requires additional tokens to complete the logic structure.


        if (next !== undefined && next.length > 0) {
          Twig.log.trace('Twig.compile: ', 'Pushing ', logicToken, ' to logic stack.');

          if (stack.length > 0) {
            // Put any currently held output into the output list of the logic operator
            // currently at the head of the stack before we push a new one on.
            prevToken = stack.pop();
            prevToken.output = prevToken.output || [];
            prevToken.output = prevToken.output.concat(intermediateOutput);
            stack.push(prevToken);
            intermediateOutput = [];
          } // Push the new logic token onto the logic stack


          stack.push(logicToken);
        } else if (open !== undefined && open) {
          tokOutput = {
            type: Twig.token.type.logic,
            token: logicToken
          }; // Standalone token (like {% set ... %}

          if (stack.length > 0) {
            intermediateOutput.push(tokOutput);
          } else {
            output.push(tokOutput);
          }
        }
      };

      while (tokens.length > 0) {
        token = tokens.shift();
        prevOutput = output[output.length - 1];
        prevIntermediateOutput = intermediateOutput[intermediateOutput.length - 1];
        nextToken = tokens[0];
        Twig.log.trace('Compiling token ', token);

        switch (token.type) {
          case Twig.token.type.raw:
            if (stack.length > 0) {
              intermediateOutput.push(token);
            } else {
              output.push(token);
            }

            break;

          case Twig.token.type.logic:
            compileLogic.call(self, token);
            break;
          // Do nothing, comments should be ignored

          case Twig.token.type.comment:
            break;

          case Twig.token.type.output:
            compileOutput.call(self, token);
            break;
          // Kill whitespace ahead and behind this token

          case Twig.token.type.logicWhitespacePre:
          case Twig.token.type.logicWhitespacePost:
          case Twig.token.type.logicWhitespaceBoth:
          case Twig.token.type.outputWhitespacePre:
          case Twig.token.type.outputWhitespacePost:
          case Twig.token.type.outputWhitespaceBoth:
            if (token.type !== Twig.token.type.outputWhitespacePost && token.type !== Twig.token.type.logicWhitespacePost) {
              if (prevOutput) {
                // If the previous output is raw, pop it off
                if (prevOutput.type === Twig.token.type.raw) {
                  output.pop();
                  prevOutput.value = prevOutput.value.trimEnd(); // Repush the previous output

                  output.push(prevOutput);
                }
              }

              if (prevIntermediateOutput) {
                // If the previous intermediate output is raw, pop it off
                if (prevIntermediateOutput.type === Twig.token.type.raw) {
                  intermediateOutput.pop();
                  prevIntermediateOutput.value = prevIntermediateOutput.value.trimEnd(); // Repush the previous intermediate output

                  intermediateOutput.push(prevIntermediateOutput);
                }
              }
            } // Compile this token


            switch (token.type) {
              case Twig.token.type.outputWhitespacePre:
              case Twig.token.type.outputWhitespacePost:
              case Twig.token.type.outputWhitespaceBoth:
                compileOutput.call(self, token);
                break;

              case Twig.token.type.logicWhitespacePre:
              case Twig.token.type.logicWhitespacePost:
              case Twig.token.type.logicWhitespaceBoth:
                compileLogic.call(self, token);
                break;

              default:
                break;
            }

            if (token.type !== Twig.token.type.outputWhitespacePre && token.type !== Twig.token.type.logicWhitespacePre) {
              if (nextToken) {
                // If the next token is raw, shift it out
                if (nextToken.type === Twig.token.type.raw) {
                  tokens.shift();
                  nextToken.value = nextToken.value.trimStart(); // Unshift the next token

                  tokens.unshift(nextToken);
                }
              }
            }

            break;

          default:
            break;
        }

        Twig.log.trace('Twig.compile: ', ' Output: ', output, ' Logic Stack: ', stack, ' Pending Output: ', intermediateOutput);
      } // Verify that there are no logic tokens left in the stack.


      if (stack.length > 0) {
        unclosedToken = stack.pop();
        throw new Error('Unable to find an end tag for ' + unclosedToken.type + ', expecting one of ' + unclosedToken.next);
      }

      return output;
    } catch (error) {
      if (self.options.rethrow) {
        if (error.type === 'TwigException' && !error.file) {
          error.file = self.id;
        }

        throw error;
      } else {
        Twig.log.error('Error compiling twig template ' + self.id + ': ');

        if (error.stack) {
          Twig.log.error(error.stack);
        } else {
          Twig.log.error(error.toString());
        }
      }
    }
  };

  function handleException(state, ex) {
    if (state.template.options.rethrow) {
      if (typeof ex === 'string') {
        ex = new Twig.Error(ex);
      }

      if (ex.type === 'TwigException' && !ex.file) {
        ex.file = state.template.id;
      }

      throw ex;
    } else {
      Twig.log.error('Error parsing twig template ' + state.template.id + ': ');

      if (ex.stack) {
        Twig.log.error(ex.stack);
      } else {
        Twig.log.error(ex.toString());
      }

      if (Twig.debug) {
        return ex.toString();
      }
    }
  }
  /**
   * Tokenize and compile a string template.
   *
   * @param {string} data The template.
   *
   * @return {Array} The compiled tokens.
   */


  Twig.prepare = function (data) {
    // Tokenize
    Twig.log.debug('Twig.prepare: ', 'Tokenizing ', data);
    var rawTokens = Twig.tokenize.call(this, data); // Compile

    Twig.log.debug('Twig.prepare: ', 'Compiling ', rawTokens);
    var tokens = Twig.compile.call(this, rawTokens);
    Twig.log.debug('Twig.prepare: ', 'Compiled ', tokens);
    return tokens;
  };
  /**
   * Join the output token's stack and escape it if needed
   *
   * @param {Array} Output token's stack
   *
   * @return {string|String} Autoescaped output
   */


  Twig.output = function (output) {
    var autoescape = this.options.autoescape;

    if (!autoescape) {
      return output.join('');
    }

    var strategy = typeof autoescape === 'string' ? autoescape : 'html';
    var escapedOutput = output.map(function (str) {
      if (str && str.twigMarkup !== true && str.twigMarkup !== strategy && !(strategy === 'html' && str.twigMarkup === 'html_attr')) {
        str = Twig.filters.escape(str, [strategy]);
      }

      return str;
    });

    if (escapedOutput.length === 0) {
      return '';
    }

    var joinedOutput = escapedOutput.join('');

    if (joinedOutput.length === 0) {
      return '';
    }

    return new Twig.Markup(joinedOutput, true);
  }; // Namespace for template storage and retrieval


  Twig.Templates = {
    /**
     * Registered template loaders - use Twig.Templates.registerLoader to add supported loaders
     * @type {Object}
     */
    loaders: {},

    /**
     * Registered template parsers - use Twig.Templates.registerParser to add supported parsers
     * @type {Object}
     */
    parsers: {},

    /**
     * Cached / loaded templates
     * @type {Object}
     */
    registry: {}
  };
  /**
   * Is this id valid for a twig template?
   *
   * @param {string} id The ID to check.
   *
   * @throws {Twig.Error} If the ID is invalid or used.
   * @return {boolean} True if the ID is valid.
   */

  Twig.validateId = function (id) {
    if (id === 'prototype') {
      throw new Twig.Error(id + ' is not a valid twig identifier');
    } else if (Twig.cache && Object.hasOwnProperty.call(Twig.Templates.registry, id)) {
      throw new Twig.Error('There is already a template with the ID ' + id);
    }

    return true;
  };
  /**
   * Register a template loader
   *
   * @example
   * Twig.extend(function (Twig) {
   *    Twig.Templates.registerLoader('custom_loader', function (location, params, callback, errorCallback) {
   *        // ... load the template ...
   *        params.data = loadedTemplateData;
   *        // create and return the template
   *        var template = new Twig.Template(params);
   *        if (typeof callback === 'function') {
   *            callback(template);
   *        }
   *        return template;
   *    });
   * });
   *
   * @param {String} methodName The method this loader is intended for (ajax, fs)
   * @param {Function} func The function to execute when loading the template
   * @param {Object|undefined} scope Optional scope parameter to bind func to
   *
   * @throws Twig.Error
   *
   * @return {void}
   */


  Twig.Templates.registerLoader = function (methodName, func, scope) {
    if (typeof func !== 'function') {
      throw new Twig.Error('Unable to add loader for ' + methodName + ': Invalid function reference given.');
    }

    if (scope) {
      func = func.bind(scope);
    }

    this.loaders[methodName] = func;
  };
  /**
   * Remove a registered loader
   *
   * @param {String} methodName The method name for the loader you wish to remove
   *
   * @return {void}
   */


  Twig.Templates.unRegisterLoader = function (methodName) {
    if (this.isRegisteredLoader(methodName)) {
      delete this.loaders[methodName];
    }
  };
  /**
   * See if a loader is registered by its method name
   *
   * @param {String} methodName The name of the loader you are looking for
   *
   * @return {boolean}
   */


  Twig.Templates.isRegisteredLoader = function (methodName) {
    return Object.hasOwnProperty.call(this.loaders, methodName);
  };
  /**
   * Register a template parser
   *
   * @example
   * Twig.extend(function (Twig) {
   *    Twig.Templates.registerParser('custom_parser', function (params) {
   *        // this template source can be accessed in params.data
   *        var template = params.data
   *
   *        // ... custom process that modifies the template
   *
   *        // return the parsed template
   *        return template;
   *    });
   * });
   *
   * @param {String} methodName The method this parser is intended for (twig, source)
   * @param {Function} func The function to execute when parsing the template
   * @param {Object|undefined} scope Optional scope parameter to bind func to
   *
   * @throws Twig.Error
   *
   * @return {void}
   */


  Twig.Templates.registerParser = function (methodName, func, scope) {
    if (typeof func !== 'function') {
      throw new Twig.Error('Unable to add parser for ' + methodName + ': Invalid function regerence given.');
    }

    if (scope) {
      func = func.bind(scope);
    }

    this.parsers[methodName] = func;
  };
  /**
   * Remove a registered parser
   *
   * @param {String} methodName The method name for the parser you wish to remove
   *
   * @return {void}
   */


  Twig.Templates.unRegisterParser = function (methodName) {
    if (this.isRegisteredParser(methodName)) {
      delete this.parsers[methodName];
    }
  };
  /**
   * See if a parser is registered by its method name
   *
   * @param {String} methodName The name of the parser you are looking for
   *
   * @return {boolean}
   */


  Twig.Templates.isRegisteredParser = function (methodName) {
    return Object.hasOwnProperty.call(this.parsers, methodName);
  };
  /**
   * Save a template object to the store.
   *
   * @param {Twig.Template} template   The twig.js template to store.
   */


  Twig.Templates.save = function (template) {
    if (template.id === undefined) {
      throw new Twig.Error('Unable to save template with no id');
    }

    Twig.Templates.registry[template.id] = template;
  };
  /**
   * Load a previously saved template from the store.
   *
   * @param {string} id   The ID of the template to load.
   *
   * @return {Twig.Template} A twig.js template stored with the provided ID.
   */


  Twig.Templates.load = function (id) {
    if (!Object.hasOwnProperty.call(Twig.Templates.registry, id)) {
      return null;
    }

    return Twig.Templates.registry[id];
  };
  /**
   * Load a template from a remote location using AJAX and saves in with the given ID.
   *
   * Available parameters:
   *
   *      async:       Should the HTTP request be performed asynchronously.
   *                      Defaults to true.
   *      method:      What method should be used to load the template
   *                      (fs or ajax)
   *      parser:      What method should be used to parse the template
   *                      (twig or source)
   *      precompiled: Has the template already been compiled.
   *
   * @param {string} location  The remote URL to load as a template.
   * @param {Object} params The template parameters.
   * @param {function} callback  A callback triggered when the template finishes loading.
   * @param {function} errorCallback  A callback triggered if an error occurs loading the template.
   *
   *
   */


  Twig.Templates.loadRemote = function (location, params, callback, errorCallback) {
    // Default to the URL so the template is cached.
    var id = typeof params.id === 'undefined' ? location : params.id;
    var cached = Twig.Templates.registry[id]; // Check for existing template

    if (Twig.cache && typeof cached !== 'undefined') {
      // A template is already saved with the given id.
      if (typeof callback === 'function') {
        callback(cached);
      } // TODO: if async, return deferred promise


      return cached;
    } // If the parser name hasn't been set, default it to twig


    params.parser = params.parser || 'twig';
    params.id = id; // Default to async

    if (typeof params.async === 'undefined') {
      params.async = true;
    } // Assume 'fs' if the loader is not defined


    var loader = this.loaders[params.method] || this.loaders.fs;
    return loader.call(this, location, params, callback, errorCallback);
  }; // Determine object type


  function is(type, obj) {
    var clas = Object.prototype.toString.call(obj).slice(8, -1);
    return obj !== undefined && obj !== null && clas === type;
  }
  /**
   * A wrapper for template blocks.
   *
   * @param  {Twig.Template} The template that the block was originally defined in.
   * @param  {Object} The compiled block token.
   */


  Twig.Block = function (template, token) {
    this.template = template;
    this.token = token;
  };
  /**
   * Render the block using a specific parse state and context.
   *
   * @param  {Twig.ParseState} parseState
   * @param  {Object} context
   *
   * @return {Promise}
   */


  Twig.Block.prototype.render = function (parseState, context) {
    var originalTemplate = parseState.template;
    var promise;
    parseState.template = this.template;

    if (this.token.expression) {
      promise = Twig.expression.parseAsync.call(parseState, this.token.output, context);
    } else {
      promise = parseState.parseAsync(this.token.output, context);
    }

    return promise.then(function (value) {
      return Twig.expression.parseAsync.call(parseState, {
        type: Twig.expression.type.string,
        value: value
      }, context);
    }).then(function (output) {
      parseState.template = originalTemplate;
      return output;
    });
  };
  /**
   * Holds the state needed to parse a template.
   *
   * @param {Twig.Template} template The template that the tokens being parsed are associated with.
   * @param {Object} blockOverrides Any blocks that should override those defined in the associated template.
   */


  Twig.ParseState = function (template, blockOverrides) {
    this.renderedBlocks = {};
    this.overrideBlocks = blockOverrides === undefined ? {} : blockOverrides;
    this.context = {};
    this.macros = {};
    this.nestingStack = [];
    this.template = template;
  };
  /**
   * Get a block by its name, resolving in the following order:
   *     - override blocks specified when initialized (except when excluded)
   *     - blocks resolved from the associated template
   *     - blocks resolved from the parent template when extending
   *
   * @param {String} name The name of the block to return.
   * @param {Boolean} checkOnlyInheritedBlocks Whether to skip checking the overrides and associated template, will not skip by default.
   *
   * @return {Twig.Block|undefined}
   */


  Twig.ParseState.prototype.getBlock = function (name, checkOnlyInheritedBlocks) {
    var block;

    if (checkOnlyInheritedBlocks !== true) {
      // Blocks specified when initialized
      block = this.overrideBlocks[name];
    }

    if (block === undefined) {
      // Block defined by the associated template
      block = this.template.getBlock(name, checkOnlyInheritedBlocks);
    }

    if (block === undefined && this.template.parentTemplate !== null) {
      // Block defined in the parent template when extending
      block = this.template.parentTemplate.getBlock(name);
    }

    return block;
  };
  /**
   * Get all the available blocks, resolving in the following order:
   *     - override blocks specified when initialized
   *     - blocks resolved from the associated template
   *     - blocks resolved from the parent template when extending (except when excluded)
   *
   * @param {Boolean} includeParentBlocks Whether to get blocks from the parent template when extending, will always do so by default.
   *
   * @return {Object}
   */


  Twig.ParseState.prototype.getBlocks = function (includeParentBlocks) {
    var blocks = {};

    if (includeParentBlocks !== false && this.template.parentTemplate !== null && // Prevent infinite loop
    this.template.parentTemplate !== this.template) {
      // Blocks from the parent template when extending
      blocks = this.template.parentTemplate.getBlocks();
    }

    blocks = _objectSpread(_objectSpread(_objectSpread({}, blocks), this.template.getBlocks()), this.overrideBlocks);
    return blocks;
  };
  /**
   * Get the closest token of a specific type to the current nest level.
   *
   * @param  {String} type  The logic token type
   *
   * @return {Object}
   */


  Twig.ParseState.prototype.getNestingStackToken = function (type) {
    var matchingToken;
    this.nestingStack.forEach(function (token) {
      if (matchingToken === undefined && token.type === type) {
        matchingToken = token;
      }
    });
    return matchingToken;
  };
  /**
   * Parse a set of tokens using the current state.
   *
   * @param {Array} tokens The compiled tokens.
   * @param {Object} context The context to set the state to while parsing.
   * @param {Boolean} allowAsync Whether to parse asynchronously.
   * @param {Object} blocks Blocks that should override any defined while parsing.
   *
   * @return {String} The rendered tokens.
   *
   */


  Twig.ParseState.prototype.parse = function (tokens, context, allowAsync) {
    var state = this;
    var output = []; // Store any error that might be thrown by the promise chain.

    var err = null; // This will be set to isAsync if template renders synchronously

    var isAsync = true;
    var promise = null; // Track logic chains

    var chain = true;

    if (context) {
      state.context = context;
    }
    /*
     * Extracted into it's own function such that the function
     * does not get recreated over and over again in the `forEach`
     * loop below. This method can be compiled and optimized
     * a single time instead of being recreated on each iteration.
     */


    function outputPush(o) {
      output.push(o);
    }

    function parseTokenLogic(logic) {
      if (typeof logic.chain !== 'undefined') {
        chain = logic.chain;
      }

      if (typeof logic.context !== 'undefined') {
        state.context = logic.context;
      }

      if (typeof logic.output !== 'undefined') {
        output.push(logic.output);
      }
    }

    promise = Twig.async.forEach(tokens, function (token) {
      Twig.log.debug('Twig.ParseState.parse: ', 'Parsing token: ', token);

      switch (token.type) {
        case Twig.token.type.raw:
          output.push(Twig.filters.raw(token.value));
          break;

        case Twig.token.type.logic:
          return Twig.logic.parseAsync.call(state, token.token
          /* logicToken */
          , state.context, chain).then(parseTokenLogic);

        case Twig.token.type.comment:
          // Do nothing, comments should be ignored
          break;
        // Fall through whitespace to output

        case Twig.token.type.outputWhitespacePre:
        case Twig.token.type.outputWhitespacePost:
        case Twig.token.type.outputWhitespaceBoth:
        case Twig.token.type.output:
          Twig.log.debug('Twig.ParseState.parse: ', 'Output token: ', token.stack); // Parse the given expression in the given context

          return Twig.expression.parseAsync.call(state, token.stack, state.context).then(outputPush);

        default:
          break;
      }
    }).then(function () {
      output = Twig.output.call(state.template, output);
      isAsync = false;
      return output;
    })["catch"](function (error) {
      if (allowAsync) {
        handleException(state, error);
      }

      err = error;
    }); // If `allowAsync` we will always return a promise since we do not
    // know in advance if we are going to run asynchronously or not.

    if (allowAsync) {
      return promise;
    } // Handle errors here if we fail synchronously.


    if (err !== null) {
      return handleException(state, err);
    } // If `allowAsync` is not true we should not allow the user
    // to use asynchronous functions or filters.


    if (isAsync) {
      throw new Twig.Error('You are using Twig.js in sync mode in combination with async extensions.');
    }

    return output;
  };
  /**
   * Create a new twig.js template.
   *
   * Parameters: {
   *      data:   The template, either pre-compiled tokens or a string template
   *      id:     The name of this template
   * }
   *
   * @param {Object} params The template parameters.
   */


  Twig.Template = function (params) {
    var data = params.data,
        id = params.id,
        base = params.base,
        path = params.path,
        url = params.url,
        name = params.name,
        method = params.method,
        options = params.options; // # What is stored in a Twig.Template
    //
    // The Twig Template hold several chucks of data.
    //
    //     {
    //          id:     The token ID (if any)
    //          tokens: The list of tokens that makes up this template.
    //          base:   The base template (if any)
    //            options:  {
    //                Compiler/parser options
    //
    //                strict_variables: true/false
    //                    Should missing variable/keys emit an error message. If false, they default to null.
    //            }
    //     }
    //

    this.base = base;
    this.blocks = {
      defined: {},
      imported: {}
    };
    this.id = id;
    this.method = method;
    this.name = name;
    this.options = options;
    this.parentTemplate = null;
    this.path = path;
    this.url = url;

    if (is('String', data)) {
      this.tokens = Twig.prepare.call(this, data);
    } else {
      this.tokens = data;
    }

    if (id !== undefined) {
      Twig.Templates.save(this);
    }
  };
  /**
   * Get a block by its name, resolving in the following order:
   *     - blocks defined in the template itself
   *     - blocks imported from another template
   *
   * @param {String} name The name of the block to return.
   * @param {Boolean} checkOnlyInheritedBlocks Whether to skip checking the blocks defined in the template itself, will not skip by default.
   *
   * @return {Twig.Block|undefined}
   */


  Twig.Template.prototype.getBlock = function (name, checkOnlyInheritedBlocks) {
    var checkImports = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    var block;

    if (checkOnlyInheritedBlocks !== true) {
      block = this.blocks.defined[name];
    }

    if (checkImports && block === undefined) {
      block = this.blocks.imported[name];
    }

    if (block === undefined && this.parentTemplate !== null) {
      /**
       * Block defined in the parent template when extending.
       * This recursion is useful to inherit from ascendants.
       * But take care of not considering ascendants' {% use %}
       */
      block = this.parentTemplate.getBlock(name, checkOnlyInheritedBlocks, checkImports = false);
    }

    return block;
  };
  /**
   * Get all the available blocks, resolving in the following order:
   *     - blocks defined in the template itself
   *     - blocks imported from other templates
   *
   * @return {Object}
   */


  Twig.Template.prototype.getBlocks = function () {
    var blocks = {};
    blocks = _objectSpread(_objectSpread(_objectSpread({}, blocks), this.blocks.imported), this.blocks.defined);
    return blocks;
  };

  Twig.Template.prototype.render = function (context, params, allowAsync) {
    var template = this;
    params = params || {};
    return Twig.async.potentiallyAsync(template, allowAsync, function () {
      var state = new Twig.ParseState(template, params.blocks);
      return state.parseAsync(template.tokens, context).then(function (output) {
        var parentTemplate;
        var url;

        if (template.parentTemplate !== null) {
          // This template extends another template
          if (template.options.allowInlineIncludes) {
            // The template is provided inline
            parentTemplate = Twig.Templates.load(template.parentTemplate);

            if (parentTemplate) {
              parentTemplate.options = template.options;
            }
          } // Check for the template file via include


          if (!parentTemplate) {
            url = Twig.path.parsePath(template, template.parentTemplate);
            parentTemplate = Twig.Templates.loadRemote(url, {
              method: template.getLoaderMethod(),
              base: template.base,
              async: false,
              id: url,
              options: template.options
            });
          }

          template.parentTemplate = parentTemplate;
          return template.parentTemplate.renderAsync(state.context, {
            blocks: state.getBlocks(false),
            isInclude: true
          });
        }

        if (params.isInclude === true) {
          return output;
        }

        return output.valueOf();
      });
    });
  };

  Twig.Template.prototype.importFile = function (file) {
    var url = null;
    var subTemplate;

    if (!this.url && this.options.allowInlineIncludes) {
      file = this.path ? Twig.path.parsePath(this, file) : file;
      subTemplate = Twig.Templates.load(file);

      if (!subTemplate) {
        subTemplate = Twig.Templates.loadRemote(url, {
          id: file,
          method: this.getLoaderMethod(),
          async: false,
          path: file,
          options: this.options
        });

        if (!subTemplate) {
          throw new Twig.Error('Unable to find the template ' + file);
        }
      }

      subTemplate.options = this.options;
      return subTemplate;
    }

    url = Twig.path.parsePath(this, file); // Load blocks from an external file

    subTemplate = Twig.Templates.loadRemote(url, {
      method: this.getLoaderMethod(),
      base: this.base,
      async: false,
      options: this.options,
      id: url
    });
    return subTemplate;
  };

  Twig.Template.prototype.getLoaderMethod = function () {
    if (this.path) {
      return 'fs';
    }

    if (this.url) {
      return 'ajax';
    }

    return this.method || 'fs';
  };

  Twig.Template.prototype.compile = function (options) {
    // Compile the template into raw JS
    return Twig.compiler.compile(this, options);
  };
  /**
   * Create safe output
   *
   * @param {string} Content safe to output
   *
   * @return {String} Content wrapped into a String
   */


  Twig.Markup = function (content, strategy) {
    if (typeof content !== 'string') {
      return content;
    }
    /* eslint-disable no-new-wrappers, unicorn/new-for-builtins */


    var output = new String(content);
    /* eslint-enable */

    output.twigMarkup = typeof strategy === 'undefined' ? true : strategy;
    return output;
  };

  return Twig;
};

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.compiler.js
//
// This file handles compiling templates into JS
module.exports = function (Twig) {
  /**
   * Namespace for compilation.
   */
  Twig.compiler = {
    module: {}
  }; // Compile a Twig Template to output.

  Twig.compiler.compile = function (template, options) {
    // Get tokens
    var tokens = JSON.stringify(template.tokens);
    var id = template.id;
    var output = null;

    if (options.module) {
      if (Twig.compiler.module[options.module] === undefined) {
        throw new Twig.Error('Unable to find module type ' + options.module);
      }

      output = Twig.compiler.module[options.module](id, tokens, options.twig);
    } else {
      output = Twig.compiler.wrap(id, tokens);
    }

    return output;
  };

  Twig.compiler.module = {
    amd: function amd(id, tokens, pathToTwig) {
      return 'define(["' + pathToTwig + '"], function (Twig) {\n\tvar twig, templates;\ntwig = Twig.twig;\ntemplates = ' + Twig.compiler.wrap(id, tokens) + '\n\treturn templates;\n});';
    },
    node: function node(id, tokens) {
      return 'var twig = require("twig").twig;\nexports.template = ' + Twig.compiler.wrap(id, tokens);
    },
    cjs2: function cjs2(id, tokens, pathToTwig) {
      return 'module.declare([{ twig: "' + pathToTwig + '" }], function (require, exports, module) {\n\tvar twig = require("twig").twig;\n\texports.template = ' + Twig.compiler.wrap(id, tokens) + '\n});';
    }
  };

  Twig.compiler.wrap = function (id, tokens) {
    return 'twig({id:"' + id.replace('"', '\\"') + '", data:' + tokens + ', precompiled: true});\n';
  };

  return Twig;
};

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _typeof2 = _interopRequireDefault(__webpack_require__(1));

var _toConsumableArray2 = _interopRequireDefault(__webpack_require__(12));

// ## twig.expression.js
//
// This file handles tokenizing, compiling and parsing expressions.
module.exports = function (Twig) {
  'use strict';

  function parseParams(state, params, context) {
    if (params) {
      return Twig.expression.parseAsync.call(state, params, context);
    }

    return Twig.Promise.resolve(false);
  }
  /**
   * Namespace for expression handling.
   */


  Twig.expression = {};

  __webpack_require__(17)(Twig);
  /**
   * Reserved word that can't be used as variable names.
   */


  Twig.expression.reservedWords = ['true', 'false', 'null', 'TRUE', 'FALSE', 'NULL', '_context', 'and', 'b-and', 'or', 'b-or', 'b-xor', 'in', 'not in', 'if', 'matches', 'starts', 'ends', 'with'];
  /**
   * The type of tokens used in expressions.
   */

  Twig.expression.type = {
    comma: 'Twig.expression.type.comma',
    operator: {
      unary: 'Twig.expression.type.operator.unary',
      binary: 'Twig.expression.type.operator.binary'
    },
    string: 'Twig.expression.type.string',
    bool: 'Twig.expression.type.bool',
    slice: 'Twig.expression.type.slice',
    array: {
      start: 'Twig.expression.type.array.start',
      end: 'Twig.expression.type.array.end'
    },
    object: {
      start: 'Twig.expression.type.object.start',
      end: 'Twig.expression.type.object.end'
    },
    parameter: {
      start: 'Twig.expression.type.parameter.start',
      end: 'Twig.expression.type.parameter.end'
    },
    subexpression: {
      start: 'Twig.expression.type.subexpression.start',
      end: 'Twig.expression.type.subexpression.end'
    },
    key: {
      period: 'Twig.expression.type.key.period',
      brackets: 'Twig.expression.type.key.brackets'
    },
    filter: 'Twig.expression.type.filter',
    _function: 'Twig.expression.type._function',
    variable: 'Twig.expression.type.variable',
    number: 'Twig.expression.type.number',
    _null: 'Twig.expression.type.null',
    context: 'Twig.expression.type.context',
    test: 'Twig.expression.type.test'
  };
  Twig.expression.set = {
    // What can follow an expression (in general)
    operations: [Twig.expression.type.filter, Twig.expression.type.operator.unary, Twig.expression.type.operator.binary, Twig.expression.type.array.end, Twig.expression.type.object.end, Twig.expression.type.parameter.end, Twig.expression.type.subexpression.end, Twig.expression.type.comma, Twig.expression.type.test],
    expressions: [Twig.expression.type._function, Twig.expression.type.bool, Twig.expression.type.string, Twig.expression.type.variable, Twig.expression.type.number, Twig.expression.type._null, Twig.expression.type.context, Twig.expression.type.parameter.start, Twig.expression.type.array.start, Twig.expression.type.object.start, Twig.expression.type.subexpression.start, Twig.expression.type.operator.unary]
  }; // Most expressions allow a '.' or '[' after them, so we provide a convenience set

  Twig.expression.set.operationsExtended = Twig.expression.set.operations.concat([Twig.expression.type.key.period, Twig.expression.type.key.brackets, Twig.expression.type.slice]); // Some commonly used compile and parse functions.

  Twig.expression.fn = {
    compile: {
      push: function push(token, stack, output) {
        output.push(token);
      },
      pushBoth: function pushBoth(token, stack, output) {
        output.push(token);
        stack.push(token);
      }
    },
    parse: {
      push: function push(token, stack) {
        stack.push(token);
      },
      pushValue: function pushValue(token, stack) {
        stack.push(token.value);
      }
    }
  }; // The regular expressions and compile/parse logic used to match tokens in expressions.
  //
  // Properties:
  //
  //      type:  The type of expression this matches
  //
  //      regex: One or more regular expressions that matche the format of the token.
  //
  //      next:  Valid tokens that can occur next in the expression.
  //
  // Functions:
  //
  //      compile: A function that compiles the raw regular expression match into a token.
  //
  //      parse:   A function that parses the compiled token into output.
  //

  Twig.expression.definitions = [{
    type: Twig.expression.type.test,
    regex: /^is\s+(not)?\s*([a-zA-Z_]\w*(\s?as)?)/,
    next: Twig.expression.set.operations.concat([Twig.expression.type.parameter.start]),
    compile: function compile(token, stack, output) {
      token.filter = token.match[2];
      token.modifier = token.match[1];
      delete token.match;
      delete token.value;
      output.push(token);
    },
    parse: function parse(token, stack, context) {
      var value = stack.pop();
      var state = this;
      return parseParams(state, token.params, context).then(function (params) {
        var result = Twig.test(token.filter, value, params);

        if (token.modifier === 'not') {
          stack.push(!result);
        } else {
          stack.push(result);
        }
      });
    }
  }, {
    type: Twig.expression.type.comma,
    // Match a comma
    regex: /^,/,
    next: Twig.expression.set.expressions.concat([Twig.expression.type.array.end, Twig.expression.type.object.end]),
    compile: function compile(token, stack, output) {
      var i = stack.length - 1;
      var stackToken;
      delete token.match;
      delete token.value; // Pop tokens off the stack until the start of the object

      for (; i >= 0; i--) {
        stackToken = stack.pop();

        if (stackToken.type === Twig.expression.type.object.start || stackToken.type === Twig.expression.type.parameter.start || stackToken.type === Twig.expression.type.array.start) {
          stack.push(stackToken);
          break;
        }

        output.push(stackToken);
      }

      output.push(token);
    }
  }, {
    /**
     * Match a number (integer or decimal)
     */
    type: Twig.expression.type.number,
    // Match a number
    regex: /^-?\d+(\.\d+)?/,
    next: Twig.expression.set.operations,
    compile: function compile(token, stack, output) {
      token.value = Number(token.value);
      output.push(token);
    },
    parse: Twig.expression.fn.parse.pushValue
  }, {
    type: Twig.expression.type.operator.binary,
    // Match any of ??, ?:, +, *, /, -, %, ~, <, <=, >, >=, !=, ==, **, ?, :, and, b-and, or, b-or, b-xor, in, not in
    // and, or, in, not in, matches, starts with, ends with can be followed by a space or parenthesis
    regex: /(^\?\?|^\?:|^(b-and)|^(b-or)|^(b-xor)|^[+\-~%?]|^[:](?!\d\])|^[!=]==?|^[!<>]=?|^\*\*?|^\/\/?|^(and)[(|\s+]|^(or)[(|\s+]|^(in)[(|\s+]|^(not in)[(|\s+]|^(matches)|^(starts with)|^(ends with)|^\.\.)/,
    next: Twig.expression.set.expressions,
    transform: function transform(match, tokens) {
      switch (match[0]) {
        case 'and(':
        case 'or(':
        case 'in(':
        case 'not in(':
          // Strip off the ( if it exists
          tokens[tokens.length - 1].value = match[2];
          return match[0];

        default:
          return '';
      }
    },
    compile: function compile(token, stack, output) {
      delete token.match;
      token.value = token.value.trim();
      var value = token.value;
      var operator = Twig.expression.operator.lookup(value, token);
      Twig.log.trace('Twig.expression.compile: ', 'Operator: ', operator, ' from ', value);

      while (stack.length > 0 && (stack[stack.length - 1].type === Twig.expression.type.operator.unary || stack[stack.length - 1].type === Twig.expression.type.operator.binary) && (operator.associativity === Twig.expression.operator.leftToRight && operator.precidence >= stack[stack.length - 1].precidence || operator.associativity === Twig.expression.operator.rightToLeft && operator.precidence > stack[stack.length - 1].precidence)) {
        var temp = stack.pop();
        output.push(temp);
      }

      if (value === ':') {
        // Check if this is a ternary or object key being set
        if (stack[stack.length - 1] && stack[stack.length - 1].value === '?') {// Continue as normal for a ternary
        } else {
          // This is not a ternary so we push the token to the output where it can be handled
          //   when the assocated object is closed.
          var keyToken = output.pop();

          if (keyToken.type === Twig.expression.type.string || keyToken.type === Twig.expression.type.variable) {
            token.key = keyToken.value;
          } else if (keyToken.type === Twig.expression.type.number) {
            // Convert integer keys into string keys
            token.key = keyToken.value.toString();
          } else if (keyToken.expression && (keyToken.type === Twig.expression.type.parameter.end || keyToken.type === Twig.expression.type.subexpression.end)) {
            token.params = keyToken.params;
          } else {
            throw new Twig.Error('Unexpected value before \':\' of ' + keyToken.type + ' = ' + keyToken.value);
          }

          output.push(token);
        }
      } else {
        stack.push(operator);
      }
    },
    parse: function parse(token, stack, context) {
      var state = this;

      if (token.key) {
        // Handle ternary ':' operator
        stack.push(token);
      } else if (token.params) {
        // Handle "{(expression):value}"
        return Twig.expression.parseAsync.call(state, token.params, context).then(function (key) {
          token.key = key;
          stack.push(token); // If we're in a loop, we might need token.params later, especially in this form of "(expression):value"

          if (!context.loop) {
            delete token.params;
          }
        });
      } else {
        Twig.expression.operator.parse(token.value, stack);
      }
    }
  }, {
    type: Twig.expression.type.operator.unary,
    // Match any of not
    regex: /(^not\s+)/,
    next: Twig.expression.set.expressions,
    compile: function compile(token, stack, output) {
      delete token.match;
      token.value = token.value.trim();
      var value = token.value;
      var operator = Twig.expression.operator.lookup(value, token);
      Twig.log.trace('Twig.expression.compile: ', 'Operator: ', operator, ' from ', value);

      while (stack.length > 0 && (stack[stack.length - 1].type === Twig.expression.type.operator.unary || stack[stack.length - 1].type === Twig.expression.type.operator.binary) && (operator.associativity === Twig.expression.operator.leftToRight && operator.precidence >= stack[stack.length - 1].precidence || operator.associativity === Twig.expression.operator.rightToLeft && operator.precidence > stack[stack.length - 1].precidence)) {
        var temp = stack.pop();
        output.push(temp);
      }

      stack.push(operator);
    },
    parse: function parse(token, stack) {
      Twig.expression.operator.parse(token.value, stack);
    }
  }, {
    /**
     * Match a string. This is anything between a pair of single or double quotes.
     */
    type: Twig.expression.type.string,
    // See: http://blog.stevenlevithan.com/archives/match-quoted-string
    regex: /^(["'])(?:(?=(\\?))\2[\s\S])*?\1/,
    next: Twig.expression.set.operationsExtended,
    compile: function compile(token, stack, output) {
      var value = token.value;
      delete token.match; // Remove the quotes from the string

      if (value.slice(0, 1) === '"') {
        value = value.replace('\\"', '"');
      } else {
        value = value.replace('\\\'', '\'');
      }

      token.value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r');
      Twig.log.trace('Twig.expression.compile: ', 'String value: ', token.value);
      output.push(token);
    },
    parse: Twig.expression.fn.parse.pushValue
  }, {
    /**
     * Match a subexpression set start.
     */
    type: Twig.expression.type.subexpression.start,
    regex: /^\(/,
    next: Twig.expression.set.expressions.concat([Twig.expression.type.subexpression.end]),
    compile: function compile(token, stack, output) {
      token.value = '(';
      output.push(token);
      stack.push(token);
    },
    parse: Twig.expression.fn.parse.push
  }, {
    /**
     * Match a subexpression set end.
     */
    type: Twig.expression.type.subexpression.end,
    regex: /^\)/,
    next: Twig.expression.set.operationsExtended,
    validate: function validate(match, tokens) {
      // Iterate back through previous tokens to ensure we follow a subexpression start
      var i = tokens.length - 1;
      var foundSubexpressionStart = false;
      var nextSubexpressionStartInvalid = false;
      var unclosedParameterCount = 0;

      while (!foundSubexpressionStart && i >= 0) {
        var token = tokens[i];
        foundSubexpressionStart = token.type === Twig.expression.type.subexpression.start; // If we have previously found a subexpression end, then this subexpression start is the start of
        // that subexpression, not the subexpression we are searching for

        if (foundSubexpressionStart && nextSubexpressionStartInvalid) {
          nextSubexpressionStartInvalid = false;
          foundSubexpressionStart = false;
        } // Count parameter tokens to ensure we dont return truthy for a parameter opener


        if (token.type === Twig.expression.type.parameter.start) {
          unclosedParameterCount++;
        } else if (token.type === Twig.expression.type.parameter.end) {
          unclosedParameterCount--;
        } else if (token.type === Twig.expression.type.subexpression.end) {
          nextSubexpressionStartInvalid = true;
        }

        i--;
      } // If we found unclosed parameters, return false
      // If we didnt find subexpression start, return false
      // Otherwise return true


      return foundSubexpressionStart && unclosedParameterCount === 0;
    },
    compile: function compile(token, stack, output) {
      // This is basically a copy of parameter end compilation
      var stackToken;
      var endToken = token;
      stackToken = stack.pop();

      while (stack.length > 0 && stackToken.type !== Twig.expression.type.subexpression.start) {
        output.push(stackToken);
        stackToken = stack.pop();
      } // Move contents of parens into preceding filter


      var paramStack = [];

      while (token.type !== Twig.expression.type.subexpression.start) {
        // Add token to arguments stack
        paramStack.unshift(token);
        token = output.pop();
      }

      paramStack.unshift(token); // If the token at the top of the *stack* is a function token, pop it onto the output queue.
      // Get the token preceding the parameters

      stackToken = stack[stack.length - 1];

      if (stackToken === undefined || stackToken.type !== Twig.expression.type._function && stackToken.type !== Twig.expression.type.filter && stackToken.type !== Twig.expression.type.test && stackToken.type !== Twig.expression.type.key.brackets) {
        endToken.expression = true; // Remove start and end token from stack

        paramStack.pop();
        paramStack.shift();
        endToken.params = paramStack;
        output.push(endToken);
      } else {
        // This should never be hit
        endToken.expression = false;
        stackToken.params = paramStack;
      }
    },
    parse: function parse(token, stack, context) {
      var state = this;

      if (token.expression) {
        return Twig.expression.parseAsync.call(state, token.params, context).then(function (value) {
          stack.push(value);
        });
      }

      throw new Twig.Error('Unexpected subexpression end when token is not marked as an expression');
    }
  }, {
    /**
     * Match a parameter set start.
     */
    type: Twig.expression.type.parameter.start,
    regex: /^\(/,
    next: Twig.expression.set.expressions.concat([Twig.expression.type.parameter.end]),
    validate: function validate(match, tokens) {
      var lastToken = tokens[tokens.length - 1]; // We can't use the regex to test if we follow a space because expression is trimmed

      return lastToken && !Twig.expression.reservedWords.includes(lastToken.value.trim());
    },
    compile: Twig.expression.fn.compile.pushBoth,
    parse: Twig.expression.fn.parse.push
  }, {
    /**
     * Match a parameter set end.
     */
    type: Twig.expression.type.parameter.end,
    regex: /^\)/,
    next: Twig.expression.set.operationsExtended,
    compile: function compile(token, stack, output) {
      var stackToken;
      var endToken = token;
      stackToken = stack.pop();

      while (stack.length > 0 && stackToken.type !== Twig.expression.type.parameter.start) {
        output.push(stackToken);
        stackToken = stack.pop();
      } // Move contents of parens into preceding filter


      var paramStack = [];

      while (token.type !== Twig.expression.type.parameter.start) {
        // Add token to arguments stack
        paramStack.unshift(token);
        token = output.pop();
      }

      paramStack.unshift(token); // Get the token preceding the parameters

      token = output[output.length - 1];

      if (token === undefined || token.type !== Twig.expression.type._function && token.type !== Twig.expression.type.filter && token.type !== Twig.expression.type.test && token.type !== Twig.expression.type.key.brackets) {
        endToken.expression = true; // Remove start and end token from stack

        paramStack.pop();
        paramStack.shift();
        endToken.params = paramStack;
        output.push(endToken);
      } else {
        endToken.expression = false;
        token.params = paramStack;
      }
    },
    parse: function parse(token, stack, context) {
      var newArray = [];
      var arrayEnded = false;
      var value = null;
      var state = this;

      if (token.expression) {
        return Twig.expression.parseAsync.call(state, token.params, context).then(function (value) {
          stack.push(value);
        });
      }

      while (stack.length > 0) {
        value = stack.pop(); // Push values into the array until the start of the array

        if (value && value.type && value.type === Twig.expression.type.parameter.start) {
          arrayEnded = true;
          break;
        }

        newArray.unshift(value);
      }

      if (!arrayEnded) {
        throw new Twig.Error('Expected end of parameter set.');
      }

      stack.push(newArray);
    }
  }, {
    type: Twig.expression.type.slice,
    regex: /^\[(\d*:\d*)\]/,
    next: Twig.expression.set.operationsExtended,
    compile: function compile(token, stack, output) {
      var sliceRange = token.match[1].split(':'); // SliceStart can be undefined when we pass parameters to the slice filter later

      var sliceStart = sliceRange[0] ? parseInt(sliceRange[0], 10) : undefined;
      var sliceEnd = sliceRange[1] ? parseInt(sliceRange[1], 10) : undefined;
      token.value = 'slice';
      token.params = [sliceStart, sliceEnd]; // SliceEnd can't be undefined as the slice filter doesn't check for this, but it does check the length
      // of the params array, so just shorten it.

      if (!sliceEnd) {
        token.params = [sliceStart];
      }

      output.push(token);
    },
    parse: function parse(token, stack) {
      var input = stack.pop();
      var params = token.params;
      var state = this;
      stack.push(Twig.filter.call(state, token.value, input, params));
    }
  }, {
    /**
     * Match an array start.
     */
    type: Twig.expression.type.array.start,
    regex: /^\[/,
    next: Twig.expression.set.expressions.concat([Twig.expression.type.array.end]),
    compile: Twig.expression.fn.compile.pushBoth,
    parse: Twig.expression.fn.parse.push
  }, {
    /**
     * Match an array end.
     */
    type: Twig.expression.type.array.end,
    regex: /^\]/,
    next: Twig.expression.set.operationsExtended,
    compile: function compile(token, stack, output) {
      var i = stack.length - 1;
      var stackToken; // Pop tokens off the stack until the start of the object

      for (; i >= 0; i--) {
        stackToken = stack.pop();

        if (stackToken.type === Twig.expression.type.array.start) {
          break;
        }

        output.push(stackToken);
      }

      output.push(token);
    },
    parse: function parse(token, stack) {
      var newArray = [];
      var arrayEnded = false;
      var value = null;

      while (stack.length > 0) {
        value = stack.pop(); // Push values into the array until the start of the array

        if (value && value.type && value.type === Twig.expression.type.array.start) {
          arrayEnded = true;
          break;
        }

        newArray.unshift(value);
      }

      if (!arrayEnded) {
        throw new Twig.Error('Expected end of array.');
      }

      stack.push(newArray);
    }
  }, // Token that represents the start of a hash map '}'
  //
  // Hash maps take the form:
  //    { "key": 'value', "another_key": item }
  //
  // Keys must be quoted (either single or double) and values can be any expression.
  {
    type: Twig.expression.type.object.start,
    regex: /^\{/,
    next: Twig.expression.set.expressions.concat([Twig.expression.type.object.end]),
    compile: Twig.expression.fn.compile.pushBoth,
    parse: Twig.expression.fn.parse.push
  }, // Token that represents the end of a Hash Map '}'
  //
  // This is where the logic for building the internal
  // representation of a hash map is defined.
  {
    type: Twig.expression.type.object.end,
    regex: /^\}/,
    next: Twig.expression.set.operationsExtended,
    compile: function compile(token, stack, output) {
      var i = stack.length - 1;
      var stackToken; // Pop tokens off the stack until the start of the object

      for (; i >= 0; i--) {
        stackToken = stack.pop();

        if (stackToken && stackToken.type === Twig.expression.type.object.start) {
          break;
        }

        output.push(stackToken);
      }

      output.push(token);
    },
    parse: function parse(endToken, stack) {
      var newObject = {};
      var objectEnded = false;
      var token = null;
      var hasValue = false;
      var value = null;

      while (stack.length > 0) {
        token = stack.pop(); // Push values into the array until the start of the object

        if (token && token.type && token.type === Twig.expression.type.object.start) {
          objectEnded = true;
          break;
        }

        if (token && token.type && (token.type === Twig.expression.type.operator.binary || token.type === Twig.expression.type.operator.unary) && token.key) {
          if (!hasValue) {
            throw new Twig.Error('Missing value for key \'' + token.key + '\' in object definition.');
          }

          newObject[token.key] = value; // Preserve the order that elements are added to the map
          // This is necessary since JavaScript objects don't
          // guarantee the order of keys

          if (newObject._keys === undefined) {
            newObject._keys = [];
          }

          newObject._keys.unshift(token.key); // Reset value check


          value = null;
          hasValue = false;
        } else {
          hasValue = true;
          value = token;
        }
      }

      if (!objectEnded) {
        throw new Twig.Error('Unexpected end of object.');
      }

      stack.push(newObject);
    }
  }, // Token representing a filter
  //
  // Filters can follow any expression and take the form:
  //    expression|filter(optional, args)
  //
  // Filter parsing is done in the Twig.filters namespace.
  {
    type: Twig.expression.type.filter,
    // Match a | then a letter or _, then any number of letters, numbers, _ or -
    regex: /^\|\s?([a-zA-Z_][a-zA-Z0-9_-]*)/,
    next: Twig.expression.set.operationsExtended.concat([Twig.expression.type.parameter.start]),
    compile: function compile(token, stack, output) {
      token.value = token.match[1];
      output.push(token);
    },
    parse: function parse(token, stack, context) {
      var input = stack.pop();
      var state = this;
      return parseParams(state, token.params, context).then(function (params) {
        return Twig.filter.call(state, token.value, input, params);
      }).then(function (value) {
        stack.push(value);
      });
    }
  }, {
    type: Twig.expression.type._function,
    // Match any letter or _, then any number of letters, numbers, _ or - followed by (
    regex: /^([a-zA-Z_]\w*)\s*\(/,
    next: Twig.expression.type.parameter.start,
    validate: function validate(match) {
      // Make sure this function is not a reserved word
      return match[1] && !Twig.expression.reservedWords.includes(match[1]);
    },
    transform: function transform() {
      return '(';
    },
    compile: function compile(token, stack, output) {
      var fn = token.match[1];
      token.fn = fn; // Cleanup token

      delete token.match;
      delete token.value;
      output.push(token);
    },
    parse: function parse(token, stack, context) {
      var state = this;
      var fn = token.fn;
      var value;
      return parseParams(state, token.params, context).then(function (params) {
        if (Twig.functions[fn]) {
          // Get the function from the built-in functions
          value = Twig.functions[fn].apply(state, params);
        } else if (typeof context[fn] === 'function') {
          // Get the function from the user/context defined functions
          value = context[fn].apply(context, (0, _toConsumableArray2["default"])(params));
        } else {
          throw new Twig.Error(fn + ' function does not exist and is not defined in the context');
        }

        return value;
      }).then(function (result) {
        stack.push(result);
      });
    }
  }, // Token representing a variable.
  //
  // Variables can contain letters, numbers, underscores and
  // dashes, but must start with a letter or underscore.
  //
  // Variables are retrieved from the render context and take
  // the value of 'undefined' if the given variable doesn't
  // exist in the context.
  {
    type: Twig.expression.type.variable,
    // Match any letter or _, then any number of letters, numbers, _ or -
    regex: /^[a-zA-Z_]\w*/,
    next: Twig.expression.set.operationsExtended.concat([Twig.expression.type.parameter.start]),
    compile: Twig.expression.fn.compile.push,
    validate: function validate(match) {
      return !Twig.expression.reservedWords.includes(match[0]);
    },
    parse: function parse(token, stack, context) {
      var state = this; // Get the variable from the context

      return Twig.expression.resolveAsync.call(state, context[token.value], context).then(function (value) {
        if (state.template.options.strictVariables && value === undefined) {
          throw new Twig.Error('Variable "' + token.value + '" does not exist.');
        }

        stack.push(value);
      });
    }
  }, {
    type: Twig.expression.type.key.period,
    regex: /^\.(\w+)/,
    next: Twig.expression.set.operationsExtended.concat([Twig.expression.type.parameter.start]),
    compile: function compile(token, stack, output) {
      token.key = token.match[1];
      delete token.match;
      delete token.value;
      output.push(token);
    },
    parse: function parse(token, stack, context, nextToken) {
      var state = this;
      var key = token.key;
      var object = stack.pop();
      var value;

      if (object && !Object.prototype.hasOwnProperty.call(object, key) && state.template.options.strictVariables) {
        var keys = Object.keys(object);

        if (keys.length > 0) {
          throw new Twig.Error('Key "' + key + '" for object with keys "' + Object.keys(object).join(', ') + '" does not exist.');
        } else {
          throw new Twig.Error('Key "' + key + '" does not exist as the object is empty.');
        }
      }

      return parseParams(state, token.params, context).then(function (params) {
        if (object === null || object === undefined) {
          value = undefined;
        } else {
          var capitalize = function capitalize(value) {
            return value.slice(0, 1).toUpperCase() + value.slice(1);
          }; // Get the variable from the context


          if ((0, _typeof2["default"])(object) === 'object' && key in object) {
            value = object[key];
          } else if (object['get' + capitalize(key)]) {
            value = object['get' + capitalize(key)];
          } else if (object['is' + capitalize(key)]) {
            value = object['is' + capitalize(key)];
          } else {
            value = undefined;
          }
        } // When resolving an expression we need to pass nextToken in case the expression is a function


        return Twig.expression.resolveAsync.call(state, value, context, params, nextToken, object);
      }).then(function (result) {
        stack.push(result);
      });
    }
  }, {
    type: Twig.expression.type.key.brackets,
    regex: /^\[([^\]:]*)\]/,
    next: Twig.expression.set.operationsExtended.concat([Twig.expression.type.parameter.start]),
    compile: function compile(token, stack, output) {
      var match = token.match[1];
      delete token.value;
      delete token.match; // The expression stack for the key

      token.stack = Twig.expression.compile({
        value: match
      }).stack;
      output.push(token);
    },
    parse: function parse(token, stack, context, nextToken) {
      // Evaluate key
      var state = this;
      var params = null;
      var object;
      var value;
      return parseParams(state, token.params, context).then(function (parameters) {
        params = parameters;
        return Twig.expression.parseAsync.call(state, token.stack, context);
      }).then(function (key) {
        object = stack.pop();

        if (object && !Object.prototype.hasOwnProperty.call(object, key) && state.template.options.strictVariables) {
          var keys = Object.keys(object);

          if (keys.length > 0) {
            throw new Twig.Error('Key "' + key + '" for array with keys "' + keys.join(', ') + '" does not exist.');
          } else {
            throw new Twig.Error('Key "' + key + '" does not exist as the array is empty.');
          }
        } else if (object === null || object === undefined) {
          return null;
        } // Get the variable from the context


        if ((0, _typeof2["default"])(object) === 'object' && key in object) {
          value = object[key];
        } else {
          value = null;
        } // When resolving an expression we need to pass nextToken in case the expression is a function


        return Twig.expression.resolveAsync.call(state, value, object, params, nextToken);
      }).then(function (result) {
        stack.push(result);
      });
    }
  }, {
    /**
     * Match a null value.
     */
    type: Twig.expression.type._null,
    // Match a number
    regex: /^(null|NULL|none|NONE)/,
    next: Twig.expression.set.operations,
    compile: function compile(token, stack, output) {
      delete token.match;
      token.value = null;
      output.push(token);
    },
    parse: Twig.expression.fn.parse.pushValue
  }, {
    /**
     * Match the context
     */
    type: Twig.expression.type.context,
    regex: /^_context/,
    next: Twig.expression.set.operationsExtended.concat([Twig.expression.type.parameter.start]),
    compile: Twig.expression.fn.compile.push,
    parse: function parse(token, stack, context) {
      stack.push(context);
    }
  }, {
    /**
     * Match a boolean
     */
    type: Twig.expression.type.bool,
    regex: /^(true|TRUE|false|FALSE)/,
    next: Twig.expression.set.operations,
    compile: function compile(token, stack, output) {
      token.value = token.match[0].toLowerCase() === 'true';
      delete token.match;
      output.push(token);
    },
    parse: Twig.expression.fn.parse.pushValue
  }];
  /**
   * Resolve a context value.
   *
   * If the value is a function, it is executed with a context parameter.
   *
   * @param {string} key The context object key.
   * @param {Object} context The render context.
   */

  Twig.expression.resolveAsync = function (value, context, params, nextToken, object) {
    var state = this;

    if (typeof value !== 'function') {
      return Twig.Promise.resolve(value);
    }

    var promise = Twig.Promise.resolve(params);
    /*
    If value is a function, it will have been impossible during the compile stage to determine that a following
    set of parentheses were parameters for this function.
     Those parentheses will have therefore been marked as an expression, with their own parameters, which really
    belong to this function.
     Those parameters will also need parsing in case they are actually an expression to pass as parameters.
        */

    if (nextToken && nextToken.type === Twig.expression.type.parameter.end) {
      // When parsing these parameters, we need to get them all back, not just the last item on the stack.
      var tokensAreParameters = true;
      promise = promise.then(function () {
        return nextToken.params && Twig.expression.parseAsync.call(state, nextToken.params, context, tokensAreParameters);
      }).then(function (p) {
        // Clean up the parentheses tokens on the next loop
        nextToken.cleanup = true;
        return p;
      });
    }

    return promise.then(function (params) {
      return value.apply(object || context, params || []);
    });
  };

  Twig.expression.resolve = function (value, context, params, nextToken, object) {
    return Twig.async.potentiallyAsync(this, false, function () {
      return Twig.expression.resolveAsync.call(this, value, context, params, nextToken, object);
    });
  };
  /**
   * Registry for logic handlers.
   */


  Twig.expression.handler = {};
  /**
   * Define a new expression type, available at Twig.logic.type.{type}
   *
   * @param {string} type The name of the new type.
   */

  Twig.expression.extendType = function (type) {
    Twig.expression.type[type] = 'Twig.expression.type.' + type;
  };
  /**
   * Extend the expression parsing functionality with a new definition.
   *
   * Token definitions follow this format:
   *  {
   *      type:     One of Twig.expression.type.[type], either pre-defined or added using
   *                    Twig.expression.extendType
   *
   *      next:     Array of types from Twig.expression.type that can follow this token,
   *
   *      regex:    A regex or array of regex's that should match the token.
   *
   *      compile: function(token, stack, output) called when this token is being compiled.
   *                   Should return an object with stack and output set.
   *
   *      parse:   function(token, stack, context) called when this token is being parsed.
   *                   Should return an object with stack and context set.
   *  }
   *
   * @param {Object} definition A token definition.
   */


  Twig.expression.extend = function (definition) {
    if (!definition.type) {
      throw new Twig.Error('Unable to extend logic definition. No type provided for ' + definition);
    }

    Twig.expression.handler[definition.type] = definition;
  }; // Extend with built-in expressions


  while (Twig.expression.definitions.length > 0) {
    Twig.expression.extend(Twig.expression.definitions.shift());
  }
  /**
   * Break an expression into tokens defined in Twig.expression.definitions.
   *
   * @param {string} expression The string to tokenize.
   *
   * @return {Array} An array of tokens.
   */


  Twig.expression.tokenize = function (expression) {
    var tokens = []; // Keep an offset of the location in the expression for error messages.

    var expOffset = 0; // The valid next tokens of the previous token

    var next = null; // Match information

    var type;
    var regex;
    var regexI; // The possible next token for the match

    var tokenNext; // Has a match been found from the definitions

    var matchFound;
    var invalidMatches = [];

    var matchFunction = function matchFunction() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      // Don't pass arguments to `Array.slice`, that is a performance killer
      var matchI = arguments.length - 2;
      var match = new Array(matchI);

      while (matchI-- > 0) {
        match[matchI] = args[matchI];
      }

      Twig.log.trace('Twig.expression.tokenize', 'Matched a ', type, ' regular expression of ', match);

      if (next && !next.includes(type)) {
        invalidMatches.push(type + ' cannot follow a ' + tokens[tokens.length - 1].type + ' at template:' + expOffset + ' near \'' + match[0].slice(0, 20) + '...\''); // Not a match, don't change the expression

        return match[0];
      }

      var handler = Twig.expression.handler[type]; // Validate the token if a validation function is provided

      if (handler.validate && !handler.validate(match, tokens)) {
        return match[0];
      }

      invalidMatches = [];
      tokens.push({
        type: type,
        value: match[0],
        match: match
      });
      matchFound = true;
      next = tokenNext;
      expOffset += match[0].length; // Does the token need to return output back to the expression string
      // e.g. a function match of cycle( might return the '(' back to the expression
      // This allows look-ahead to differentiate between token types (e.g. functions and variable names)

      if (handler.transform) {
        return handler.transform(match, tokens);
      }

      return '';
    };

    Twig.log.debug('Twig.expression.tokenize', 'Tokenizing expression ', expression);

    while (expression.length > 0) {
      expression = expression.trim();

      for (type in Twig.expression.handler) {
        if (Object.hasOwnProperty.call(Twig.expression.handler, type)) {
          tokenNext = Twig.expression.handler[type].next;
          regex = Twig.expression.handler[type].regex;
          Twig.log.trace('Checking type ', type, ' on ', expression);
          matchFound = false;

          if (Array.isArray(regex)) {
            regexI = regex.length;

            while (regexI-- > 0) {
              expression = expression.replace(regex[regexI], matchFunction);
            }
          } else {
            expression = expression.replace(regex, matchFunction);
          } // An expression token has been matched. Break the for loop and start trying to
          //  match the next template (if expression isn't empty.)


          if (matchFound) {
            break;
          }
        }
      }

      if (!matchFound) {
        if (invalidMatches.length > 0) {
          throw new Twig.Error(invalidMatches.join(' OR '));
        } else {
          throw new Twig.Error('Unable to parse \'' + expression + '\' at template position' + expOffset);
        }
      }
    }

    Twig.log.trace('Twig.expression.tokenize', 'Tokenized to ', tokens);
    return tokens;
  };
  /**
   * Compile an expression token.
   *
   * @param {Object} rawToken The uncompiled token.
   *
   * @return {Object} The compiled token.
   */


  Twig.expression.compile = function (rawToken) {
    var expression = rawToken.value; // Tokenize expression

    var tokens = Twig.expression.tokenize(expression);
    var token = null;
    var output = [];
    var stack = [];
    var tokenTemplate = null;
    Twig.log.trace('Twig.expression.compile: ', 'Compiling ', expression); // Push tokens into RPN stack using the Shunting-yard algorithm
    // See http://en.wikipedia.org/wiki/Shunting_yard_algorithm

    while (tokens.length > 0) {
      token = tokens.shift();
      tokenTemplate = Twig.expression.handler[token.type];
      Twig.log.trace('Twig.expression.compile: ', 'Compiling ', token); // Compile the template

      tokenTemplate.compile(token, stack, output);
      Twig.log.trace('Twig.expression.compile: ', 'Stack is', stack);
      Twig.log.trace('Twig.expression.compile: ', 'Output is', output);
    }

    while (stack.length > 0) {
      output.push(stack.pop());
    }

    Twig.log.trace('Twig.expression.compile: ', 'Final output is', output);
    rawToken.stack = output;
    delete rawToken.value;
    return rawToken;
  };
  /**
   * Parse an RPN expression stack within a context.
   *
   * @param {Array} tokens An array of compiled expression tokens.
   * @param {Object} context The render context to parse the tokens with.
   *
   * @return {Object} The result of parsing all the tokens. The result
   *                  can be anything, String, Array, Object, etc... based on
   *                  the given expression.
   */


  Twig.expression.parse = function (tokens, context, tokensAreParameters, allowAsync) {
    var state = this; // If the token isn't an array, make it one.

    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    } // The output stack


    var stack = [];
    var loopTokenFixups = [];
    var binaryOperator = Twig.expression.type.operator.binary;
    return Twig.async.potentiallyAsync(state, allowAsync, function () {
      return Twig.async.forEach(tokens, function (token, index) {
        var tokenTemplate = null;
        var nextToken = null;
        var result; // If the token is marked for cleanup, we don't need to parse it

        if (token.cleanup) {
          return;
        } // Determine the token that follows this one so that we can pass it to the parser


        if (tokens.length > index + 1) {
          nextToken = tokens[index + 1];
        }

        tokenTemplate = Twig.expression.handler[token.type];

        if (tokenTemplate.parse) {
          result = tokenTemplate.parse.call(state, token, stack, context, nextToken);
        } // Store any binary tokens for later if we are in a loop.


        if (token.type === binaryOperator && context.loop) {
          loopTokenFixups.push(token);
        }

        return result;
      }).then(function () {
        // Check every fixup and remove "key" as long as they still have "params". This covers the use case where
        // a ":" operator is used in a loop with a "(expression):" statement. We need to be able to evaluate the expression
        var len = loopTokenFixups.length;
        var loopTokenFixup = null;

        while (len-- > 0) {
          loopTokenFixup = loopTokenFixups[len];

          if (loopTokenFixup.params && loopTokenFixup.key) {
            delete loopTokenFixup.key;
          }
        } // If parse has been called with a set of tokens that are parameters, we need to return the whole stack,
        // wrapped in an Array.


        if (tokensAreParameters) {
          var params = stack.splice(0);
          stack.push(params);
        } // Pop the final value off the stack


        return stack.pop();
      });
    });
  };

  return Twig;
};

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

var arrayWithoutHoles = __webpack_require__(13);

var iterableToArray = __webpack_require__(14);

var unsupportedIterableToArray = __webpack_require__(15);

var nonIterableSpread = __webpack_require__(16);

function _toConsumableArray(arr) {
  return arrayWithoutHoles(arr) || iterableToArray(arr) || unsupportedIterableToArray(arr) || nonIterableSpread();
}

module.exports = _toConsumableArray;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

var arrayLikeToArray = __webpack_require__(3);

function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return arrayLikeToArray(arr);
}

module.exports = _arrayWithoutHoles;

/***/ }),
/* 14 */
/***/ (function(module, exports) {

function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter)) return Array.from(iter);
}

module.exports = _iterableToArray;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

var arrayLikeToArray = __webpack_require__(3);

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return arrayLikeToArray(o, minLen);
}

module.exports = _unsupportedIterableToArray;

/***/ }),
/* 16 */
/***/ (function(module, exports) {

function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

module.exports = _nonIterableSpread;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.expression.operator.js
//
// This file handles operator lookups and parsing.
module.exports = function (Twig) {
  'use strict';
  /**
   * Operator associativity constants.
   */

  Twig.expression.operator = {
    leftToRight: 'leftToRight',
    rightToLeft: 'rightToLeft'
  };

  var containment = function containment(a, b) {
    if (b === undefined || b === null) {
      return null;
    }

    if (b.indexOf !== undefined) {
      // String
      return (a === b || a !== '') && b.includes(a);
    }

    var el;

    for (el in b) {
      if (Object.hasOwnProperty.call(b, el) && b[el] === a) {
        return true;
      }
    }

    return false;
  };
  /**
   * Get the precidence and associativity of an operator. These follow the order that C/C++ use.
   * See http://en.wikipedia.org/wiki/Operators_in_C_and_C++ for the table of values.
   */


  Twig.expression.operator.lookup = function (operator, token) {
    switch (operator) {
      case '..':
        token.precidence = 20;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case ',':
        token.precidence = 18;
        token.associativity = Twig.expression.operator.leftToRight;
        break;
      // Ternary

      case '?:':
      case '?':
      case ':':
        token.precidence = 16;
        token.associativity = Twig.expression.operator.rightToLeft;
        break;
      // Null-coalescing operator

      case '??':
        token.precidence = 15;
        token.associativity = Twig.expression.operator.rightToLeft;
        break;

      case 'or':
        token.precidence = 14;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'and':
        token.precidence = 13;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'b-or':
        token.precidence = 12;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'b-xor':
        token.precidence = 11;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'b-and':
        token.precidence = 10;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case '==':
      case '!=':
        token.precidence = 9;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case '<':
      case '<=':
      case '>':
      case '>=':
      case 'not in':
      case 'in':
        token.precidence = 8;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case '~': // String concatination

      case '+':
      case '-':
        token.precidence = 6;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case '//':
      case '**':
      case '*':
      case '/':
      case '%':
        token.precidence = 5;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'not':
        token.precidence = 3;
        token.associativity = Twig.expression.operator.rightToLeft;
        break;

      case 'matches':
        token.precidence = 8;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'starts with':
        token.precidence = 8;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      case 'ends with':
        token.precidence = 8;
        token.associativity = Twig.expression.operator.leftToRight;
        break;

      default:
        throw new Twig.Error('Failed to lookup operator: ' + operator + ' is an unknown operator.');
    }

    token.operator = operator;
    return token;
  };
  /**
   * Handle operations on the RPN stack.
   *
   * Returns the updated stack.
   */


  Twig.expression.operator.parse = function (operator, stack) {
    Twig.log.trace('Twig.expression.operator.parse: ', 'Handling ', operator);
    var a;
    var b;
    var c;

    if (operator === '?') {
      c = stack.pop();
    }

    b = stack.pop();

    if (operator !== 'not') {
      a = stack.pop();
    }

    if (operator !== 'in' && operator !== 'not in' && operator !== '??') {
      if (a && Array.isArray(a)) {
        a = a.length;
      }

      if (operator !== '?' && b && Array.isArray(b)) {
        b = b.length;
      }
    }

    if (operator === 'matches') {
      if (b && typeof b === 'string') {
        var reParts = b.match(/^\/(.*)\/([gims]?)$/);
        var reBody = reParts[1];
        var reFlags = reParts[2];
        b = new RegExp(reBody, reFlags);
      }
    }

    switch (operator) {
      case ':':
        // Ignore
        break;

      case '??':
        if (a === undefined) {
          a = b;
          b = c;
          c = undefined;
        }

        if (a !== undefined && a !== null) {
          stack.push(a);
        } else {
          stack.push(b);
        }

        break;

      case '?:':
        if (Twig.lib.boolval(a)) {
          stack.push(a);
        } else {
          stack.push(b);
        }

        break;

      case '?':
        if (a === undefined) {
          // An extended ternary.
          a = b;
          b = c;
          c = undefined;
        }

        if (Twig.lib.boolval(a)) {
          stack.push(b);
        } else {
          stack.push(c);
        }

        break;

      case '+':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(a + b);
        break;

      case '-':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(a - b);
        break;

      case '*':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(a * b);
        break;

      case '/':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(a / b);
        break;

      case '//':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(Math.floor(a / b));
        break;

      case '%':
        b = parseFloat(b);
        a = parseFloat(a);
        stack.push(a % b);
        break;

      case '~':
        stack.push((typeof a !== 'undefined' && a !== null ? a.toString() : '') + (typeof b !== 'undefined' && b !== null ? b.toString() : ''));
        break;

      case 'not':
      case '!':
        stack.push(!Twig.lib.boolval(b));
        break;

      case '<':
        stack.push(a < b);
        break;

      case '<=':
        stack.push(a <= b);
        break;

      case '>':
        stack.push(a > b);
        break;

      case '>=':
        stack.push(a >= b);
        break;

      case '===':
        stack.push(a === b);
        break;

      case '==':
        /* eslint-disable-next-line eqeqeq */
        stack.push(a == b);
        break;

      case '!==':
        stack.push(a !== b);
        break;

      case '!=':
        /* eslint-disable-next-line eqeqeq */
        stack.push(a != b);
        break;

      case 'or':
        stack.push(Twig.lib.boolval(a) || Twig.lib.boolval(b));
        break;

      case 'b-or':
        stack.push(a | b);
        break;

      case 'b-xor':
        stack.push(a ^ b);
        break;

      case 'and':
        stack.push(Twig.lib.boolval(a) && Twig.lib.boolval(b));
        break;

      case 'b-and':
        stack.push(a & b);
        break;

      case '**':
        stack.push(Math.pow(a, b));
        break;

      case 'not in':
        stack.push(!containment(a, b));
        break;

      case 'in':
        stack.push(containment(a, b));
        break;

      case 'matches':
        stack.push(b.test(a));
        break;

      case 'starts with':
        stack.push(typeof a === 'string' && a.indexOf(b) === 0);
        break;

      case 'ends with':
        stack.push(typeof a === 'string' && a.includes(b, a.length - b.length));
        break;

      case '..':
        stack.push(Twig.functions.range(a, b));
        break;

      default:
        throw new Twig.Error('Failed to parse operator: ' + operator + ' is an unknown operator.');
    }
  };

  return Twig;
};

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _typeof2 = _interopRequireDefault(__webpack_require__(1));

// ## twig.filters.js
//
// This file handles parsing filters.
module.exports = function (Twig) {
  // Determine object type
  function is(type, obj) {
    var clas = Object.prototype.toString.call(obj).slice(8, -1);
    return obj !== undefined && obj !== null && clas === type;
  }

  Twig.filters = {
    // String Filters
    upper: function upper(value) {
      if (typeof value !== 'string') {
        return value;
      }

      return value.toUpperCase();
    },
    lower: function lower(value) {
      if (typeof value !== 'string') {
        return value;
      }

      return value.toLowerCase();
    },
    capitalize: function capitalize(value) {
      if (typeof value !== 'string') {
        return value;
      }

      return value.slice(0, 1).toUpperCase() + value.toLowerCase().slice(1);
    },
    title: function title(value) {
      if (typeof value !== 'string') {
        return value;
      }

      return value.toLowerCase().replace(/(^|\s)([a-z])/g, function (m, p1, p2) {
        return p1 + p2.toUpperCase();
      });
    },
    length: function length(value) {
      if (Twig.lib.is('Array', value) || typeof value === 'string') {
        return value.length;
      }

      if (Twig.lib.is('Object', value)) {
        if (value._keys === undefined) {
          return Object.keys(value).length;
        }

        return value._keys.length;
      }

      return 0;
    },
    // Array/Object Filters
    reverse: function reverse(value) {
      if (is('Array', value)) {
        return value.reverse();
      }

      if (is('String', value)) {
        return value.split('').reverse().join('');
      }

      if (is('Object', value)) {
        var keys = value._keys || Object.keys(value).reverse();
        value._keys = keys;
        return value;
      }
    },
    sort: function sort(value) {
      if (is('Array', value)) {
        return value.sort();
      }

      if (is('Object', value)) {
        // Sorting objects isn't obvious since the order of
        // returned keys isn't guaranteed in JavaScript.
        // Because of this we use a "hidden" key called _keys to
        // store the keys in the order we want to return them.
        delete value._keys;
        var keys = Object.keys(value);
        var sortedKeys = keys.sort(function (a, b) {
          var a1;
          var b1; // If a and b are comparable, we're fine :-)

          if (value[a] > value[b] === !(value[a] <= value[b])) {
            return value[a] > value[b] ? 1 : value[a] < value[b] ? -1 : 0;
          } // If a and b can be parsed as numbers, we can compare
          // their numeric value


          if (!isNaN(a1 = parseFloat(value[a])) && !isNaN(b1 = parseFloat(value[b]))) {
            return a1 > b1 ? 1 : a1 < b1 ? -1 : 0;
          } // If one of the values is a string, we convert the
          // other value to string as well


          if (typeof value[a] === 'string') {
            return value[a] > value[b].toString() ? 1 : value[a] < value[b].toString() ? -1 : 0;
          }

          if (typeof value[b] === 'string') {
            return value[a].toString() > value[b] ? 1 : value[a].toString() < value[b] ? -1 : 0;
          } // Everything failed - return 'null' as sign, that
          // the values are not comparable


          return null;
        });
        value._keys = sortedKeys;
        return value;
      }
    },
    keys: function keys(value) {
      if (value === undefined || value === null) {
        return;
      }

      var keyset = value._keys || Object.keys(value);
      var output = [];
      keyset.forEach(function (key) {
        if (key === '_keys') {
          return;
        } // Ignore the _keys property


        if (Object.hasOwnProperty.call(value, key)) {
          output.push(key);
        }
      });
      return output;
    },

    /* eslint-disable-next-line camelcase */
    url_encode: function url_encode(value) {
      if (value === undefined || value === null) {
        return;
      }

      if (Twig.lib.is('Object', value)) {
        var serialize = function serialize(obj, prefix) {
          var result = [];
          var keyset = obj._keys || Object.keys(obj);
          keyset.forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) {
              return;
            }

            var resultKey = prefix ? prefix + '[' + key + ']' : key;
            var resultValue = obj[key];
            result.push(Twig.lib.is('Object', resultValue) || Array.isArray(resultValue) ? serialize(resultValue, resultKey) : encodeURIComponent(resultKey) + '=' + encodeURIComponent(resultValue));
          });
          return result.join('&amp;');
        };

        return serialize(value);
      }

      var result = encodeURIComponent(value);
      result = result.replace('\'', '%27');
      return result;
    },
    join: function join(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      var joinStr = '';
      var output = [];
      var keyset = null;

      if (params && params[0]) {
        joinStr = params[0];
      }

      if (is('Array', value)) {
        output = value;
      } else {
        keyset = value._keys || Object.keys(value);
        keyset.forEach(function (key) {
          if (key === '_keys') {
            return;
          } // Ignore the _keys property


          if (Object.hasOwnProperty.call(value, key)) {
            output.push(value[key]);
          }
        });
      }

      return output.join(joinStr);
    },
    "default": function _default(value, params) {
      if (params !== undefined && params.length > 1) {
        throw new Twig.Error('default filter expects one argument');
      }

      if (value === undefined || value === null || value === '') {
        if (params === undefined) {
          return '';
        }

        return params[0];
      }

      return value;
    },

    /* eslint-disable-next-line camelcase */
    json_encode: function json_encode(value) {
      if (value === undefined || value === null) {
        return 'null';
      }

      if ((0, _typeof2["default"])(value) === 'object' && is('Array', value)) {
        var output = [];
        value.forEach(function (v) {
          output.push(Twig.filters.json_encode(v));
        });
        return '[' + output.join(',') + ']';
      }

      if ((0, _typeof2["default"])(value) === 'object' && is('Date', value)) {
        return '"' + value.toISOString() + '"';
      }

      if ((0, _typeof2["default"])(value) === 'object') {
        var keyset = value._keys || Object.keys(value);
        var _output = [];
        keyset.forEach(function (key) {
          _output.push(JSON.stringify(key) + ':' + Twig.filters.json_encode(value[key]));
        });
        return '{' + _output.join(',') + '}';
      }

      return JSON.stringify(value);
    },
    merge: function merge(value, params) {
      var obj = [];
      var arrIndex = 0;
      var keyset = []; // Check to see if all the objects being merged are arrays

      if (is('Array', value)) {
        params.forEach(function (param) {
          if (!is('Array', param)) {
            obj = {};
          }
        });
      } else {
        // Create obj as an Object
        obj = {};
      }

      if (!is('Array', obj)) {
        obj._keys = [];
      }

      if (is('Array', value)) {
        value.forEach(function (val) {
          if (obj._keys) {
            obj._keys.push(arrIndex);
          }

          obj[arrIndex] = val;
          arrIndex++;
        });
      } else {
        keyset = value._keys || Object.keys(value);
        keyset.forEach(function (key) {
          obj[key] = value[key];

          obj._keys.push(key); // Handle edge case where a number index in an object is greater than
          //   the array counter. In such a case, the array counter is increased
          //   one past the index.
          //
          // Example {{ ["a", "b"]|merge({"4":"value"}, ["c", "d"])
          // Without this, d would have an index of "4" and overwrite the value
          //   of "value"


          var intKey = parseInt(key, 10);

          if (!isNaN(intKey) && intKey >= arrIndex) {
            arrIndex = intKey + 1;
          }
        });
      } // Mixin the merge arrays


      params.forEach(function (param) {
        if (is('Array', param)) {
          param.forEach(function (val) {
            if (obj._keys) {
              obj._keys.push(arrIndex);
            }

            obj[arrIndex] = val;
            arrIndex++;
          });
        } else {
          keyset = param._keys || Object.keys(param);
          keyset.forEach(function (key) {
            if (!obj[key]) {
              obj._keys.push(key);
            }

            obj[key] = param[key];
            var intKey = parseInt(key, 10);

            if (!isNaN(intKey) && intKey >= arrIndex) {
              arrIndex = intKey + 1;
            }
          });
        }
      });

      if (params.length === 0) {
        throw new Twig.Error('Filter merge expects at least one parameter');
      }

      return obj;
    },
    date: function date(value, params) {
      var date = Twig.functions.date(value);
      var format = params && Boolean(params.length) ? params[0] : 'F j, Y H:i';
      return Twig.lib.date(format.replace(/\\\\/g, '\\'), date);
    },

    /* eslint-disable-next-line camelcase */
    date_modify: function date_modify(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      if (params === undefined || params.length !== 1) {
        throw new Twig.Error('date_modify filter expects 1 argument');
      }

      var modifyText = params[0];
      var time;

      if (Twig.lib.is('Date', value)) {
        time = Twig.lib.strtotime(modifyText, value.getTime() / 1000);
      }

      if (Twig.lib.is('String', value)) {
        time = Twig.lib.strtotime(modifyText, Twig.lib.strtotime(value));
      }

      if (Twig.lib.is('Number', value)) {
        time = Twig.lib.strtotime(modifyText, value);
      }

      return new Date(time * 1000);
    },
    replace: function replace(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      var pairs = params[0];
      var tag;

      for (tag in pairs) {
        if (Object.hasOwnProperty.call(pairs, tag) && tag !== '_keys') {
          value = Twig.lib.replaceAll(value, tag, pairs[tag]);
        }
      }

      return value;
    },
    format: function format(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      return Twig.lib.vsprintf(value, params);
    },
    striptags: function striptags(value, allowed) {
      if (value === undefined || value === null) {
        return;
      }

      return Twig.lib.stripTags(value, allowed);
    },
    escape: function escape(value, params) {
      if (value === undefined || value === null || value === '') {
        return;
      }

      var strategy = 'html';

      if (params && Boolean(params.length) && params[0] !== true) {
        strategy = params[0];
      }

      if (strategy === 'html') {
        var rawValue = value.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        return new Twig.Markup(rawValue, 'html');
      }

      if (strategy === 'js') {
        var _rawValue = value.toString();

        var result = '';

        for (var i = 0; i < _rawValue.length; i++) {
          if (_rawValue[i].match(/^[a-zA-Z0-9,._]$/)) {
            result += _rawValue[i];
          } else {
            var _char = _rawValue.charAt(i);

            var charCode = _rawValue.charCodeAt(i); // A few characters have short escape sequences in JSON and JavaScript.
            // Escape sequences supported only by JavaScript, not JSON, are ommitted.
            // \" is also supported but omitted, because the resulting string is not HTML safe.


            var shortMap = {
              '\\': '\\\\',
              '/': '\\/',
              "\b": '\\b',
              "\f": '\\f',
              "\n": '\\n',
              "\r": '\\r',
              "\t": '\\t'
            };

            if (shortMap[_char]) {
              result += shortMap[_char];
            } else {
              result += Twig.lib.sprintf("\\u%04s", charCode.toString(16).toUpperCase());
            }
          }
        }

        return new Twig.Markup(result, 'js');
      }

      if (strategy === 'css') {
        var _rawValue2 = value.toString();

        var _result = '';

        for (var _i = 0; _i < _rawValue2.length; _i++) {
          if (_rawValue2[_i].match(/^[a-zA-Z0-9]$/)) {
            _result += _rawValue2[_i];
          } else {
            var _charCode = _rawValue2.charCodeAt(_i);

            _result += '\\' + _charCode.toString(16).toUpperCase() + ' ';
          }
        }

        return new Twig.Markup(_result, 'css');
      }

      if (strategy === 'url') {
        var _result2 = Twig.filters.url_encode(value);

        return new Twig.Markup(_result2, 'url');
      }

      if (strategy === 'html_attr') {
        var _rawValue3 = value.toString();

        var _result3 = '';

        for (var _i2 = 0; _i2 < _rawValue3.length; _i2++) {
          if (_rawValue3[_i2].match(/^[a-zA-Z0-9,.\-_]$/)) {
            _result3 += _rawValue3[_i2];
          } else if (_rawValue3[_i2].match(/^[&<>"]$/)) {
            _result3 += _rawValue3[_i2].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          } else {
            var _charCode2 = _rawValue3.charCodeAt(_i2); // The following replaces characters undefined in HTML with
            // the hex entity for the Unicode replacement character.


            if (_charCode2 <= 0x1F && _charCode2 !== 0x09 && _charCode2 !== 0x0A && _charCode2 !== 0x0D) {
              _result3 += '&#xFFFD;';
            } else if (_charCode2 < 0x80) {
              _result3 += Twig.lib.sprintf('&#x%02s;', _charCode2.toString(16).toUpperCase());
            } else {
              _result3 += Twig.lib.sprintf('&#x%04s;', _charCode2.toString(16).toUpperCase());
            }
          }
        }

        return new Twig.Markup(_result3, 'html_attr');
      }

      throw new Twig.Error('escape strategy unsupported');
    },

    /* Alias of escape */
    e: function e(value, params) {
      return Twig.filters.escape(value, params);
    },
    nl2br: function nl2br(value) {
      if (value === undefined || value === null || value === '') {
        return;
      }

      var linebreakTag = 'BACKSLASH_n_replace';
      var br = '<br />' + linebreakTag;
      value = Twig.filters.escape(value).replace(/\r\n/g, br).replace(/\r/g, br).replace(/\n/g, br);
      value = Twig.lib.replaceAll(value, linebreakTag, '\n');
      return new Twig.Markup(value);
    },

    /**
     * Adapted from: http://phpjs.org/functions/number_format:481
     */

    /* eslint-disable-next-line camelcase */
    number_format: function number_format(value, params) {
      var number = value;
      var decimals = params && params[0] ? params[0] : undefined;
      var dec = params && params[1] !== undefined ? params[1] : '.';
      var sep = params && params[2] !== undefined ? params[2] : ',';
      number = String(number).replace(/[^0-9+\-Ee.]/g, '');
      var n = isFinite(Number(number)) ? Number(number) : 0;
      var prec = isFinite(Number(decimals)) ? Math.abs(decimals) : 0;
      var s = '';

      var toFixedFix = function toFixedFix(n, prec) {
        var k = Math.pow(10, prec);
        return String(Math.round(n * k) / k);
      }; // Fix for IE parseFloat(0.55).toFixed(0) = 0;


      s = (prec ? toFixedFix(n, prec) : String(Math.round(n))).split('.');

      if (s[0].length > 3) {
        s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
      }

      if ((s[1] || '').length < prec) {
        s[1] = s[1] || '';
        s[1] += new Array(prec - s[1].length + 1).join('0');
      }

      return s.join(dec);
    },
    trim: function trim(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      var str = String(value);
      var whitespace;

      if (params && params[0]) {
        whitespace = String(params[0]);
      } else {
        whitespace = " \n\r\t\f\x0B\xA0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u200B\u2028\u2029\u3000";
      }

      for (var i = 0; i < str.length; i++) {
        if (!whitespace.includes(str.charAt(i))) {
          str = str.slice(Math.max(0, i));
          break;
        }
      }

      for (var _i3 = str.length - 1; _i3 >= 0; _i3--) {
        if (!whitespace.includes(str.charAt(_i3))) {
          str = str.slice(0, Math.max(0, _i3 + 1));
          break;
        }
      }

      return whitespace.includes(str.charAt(0)) ? '' : str;
    },
    truncate: function truncate(value, params) {
      var length = 30;
      var preserve = false;
      var separator = '...';
      value = String(value);

      if (params) {
        if (params[0]) {
          length = params[0];
        }

        if (params[1]) {
          preserve = params[1];
        }

        if (params[2]) {
          separator = params[2];
        }
      }

      if (value.length > length) {
        if (preserve) {
          length = value.indexOf(' ', length);

          if (length === -1) {
            return value;
          }
        }

        value = value.slice(0, length) + separator;
      }

      return value;
    },
    slice: function slice(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      if (params === undefined || params.length === 0) {
        throw new Twig.Error('slice filter expects at least 1 argument');
      } // Default to start of string


      var start = params[0] || 0; // Default to length of string

      var length = params.length > 1 ? params[1] : value.length; // Handle negative start values

      var startIndex = start >= 0 ? start : Math.max(value.length + start, 0);

      if (Twig.lib.is('Array', value)) {
        var output = [];

        for (var i = startIndex; i < startIndex + length && i < value.length; i++) {
          output.push(value[i]);
        }

        return output;
      }

      if (Twig.lib.is('String', value)) {
        return value.slice(startIndex, startIndex + length);
      }

      throw new Twig.Error('slice filter expects value to be an array or string');
    },
    abs: function abs(value) {
      if (value === undefined || value === null) {
        return;
      }

      return Math.abs(value);
    },
    first: function first(value) {
      if (is('Array', value)) {
        return value[0];
      }

      if (is('Object', value)) {
        if ('_keys' in value) {
          return value[value._keys[0]];
        }
      } else if (typeof value === 'string') {
        return value.slice(0, 1);
      }
    },
    split: function split(value, params) {
      if (value === undefined || value === null) {
        return;
      }

      if (params === undefined || params.length === 0 || params.length > 2) {
        throw new Twig.Error('split filter expects 1 or 2 argument');
      }

      if (Twig.lib.is('String', value)) {
        var delimiter = params[0];
        var limit = params[1];
        var split = value.split(delimiter);

        if (limit === undefined) {
          return split;
        }

        if (limit < 0) {
          return value.split(delimiter, split.length + limit);
        }

        var limitedSplit = [];

        if (delimiter === '') {
          // Empty delimiter
          // "aabbcc"|split('', 2)
          //     -> ['aa', 'bb', 'cc']
          while (split.length > 0) {
            var temp = '';

            for (var i = 0; i < limit && split.length > 0; i++) {
              temp += split.shift();
            }

            limitedSplit.push(temp);
          }
        } else {
          // Non-empty delimiter
          // "one,two,three,four,five"|split(',', 3)
          //     -> ['one', 'two', 'three,four,five']
          for (var _i4 = 0; _i4 < limit - 1 && split.length > 0; _i4++) {
            limitedSplit.push(split.shift());
          }

          if (split.length > 0) {
            limitedSplit.push(split.join(delimiter));
          }
        }

        return limitedSplit;
      }

      throw new Twig.Error('split filter expects value to be a string');
    },
    last: function last(value) {
      if (Twig.lib.is('Object', value)) {
        var keys;

        if (value._keys === undefined) {
          keys = Object.keys(value);
        } else {
          keys = value._keys;
        }

        return value[keys[keys.length - 1]];
      }

      if (Twig.lib.is('Number', value)) {
        return value.toString().slice(-1);
      } // String|array


      return value[value.length - 1];
    },
    raw: function raw(value) {
      return new Twig.Markup(value || '');
    },
    batch: function batch(items, params) {
      var size = params.shift();
      var fill = params.shift();
      var last;
      var missing;

      if (!Twig.lib.is('Array', items)) {
        throw new Twig.Error('batch filter expects items to be an array');
      }

      if (!Twig.lib.is('Number', size)) {
        throw new Twig.Error('batch filter expects size to be a number');
      }

      size = Math.ceil(size);
      var result = Twig.lib.chunkArray(items, size);

      if (fill && items.length % size !== 0) {
        last = result.pop();
        missing = size - last.length;

        while (missing--) {
          last.push(fill);
        }

        result.push(last);
      }

      return result;
    },
    round: function round(value, params) {
      params = params || [];
      var precision = params.length > 0 ? params[0] : 0;
      var method = params.length > 1 ? params[1] : 'common';
      value = parseFloat(value);

      if (precision && !Twig.lib.is('Number', precision)) {
        throw new Twig.Error('round filter expects precision to be a number');
      }

      if (method === 'common') {
        return Twig.lib.round(value, precision);
      }

      if (!Twig.lib.is('Function', Math[method])) {
        throw new Twig.Error('round filter expects method to be \'floor\', \'ceil\', or \'common\'');
      }

      return Math[method](value * Math.pow(10, precision)) / Math.pow(10, precision);
    },
    spaceless: function spaceless(value) {
      return value.replace(/>\s+</g, '><').trim();
    }
  };

  Twig.filter = function (filter, value, params) {
    var state = this;

    if (!Twig.filters[filter]) {
      throw new Twig.Error('Unable to find filter ' + filter);
    }

    return Twig.filters[filter].call(state, value, params);
  };

  Twig.filter.extend = function (filter, definition) {
    Twig.filters[filter] = definition;
  };

  return Twig;
};

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _typeof2 = _interopRequireDefault(__webpack_require__(1));

// ## twig.functions.js
//
// This file handles parsing filters.
module.exports = function (Twig) {
  /**
   * @constant
   * @type {string}
   */
  var TEMPLATE_NOT_FOUND_MESSAGE = 'Template "{name}" is not defined.';
  Twig.functions = {
    //  Attribute, block, constant, date, dump, parent, random,.
    // Range function from http://phpjs.org/functions/range:499
    // Used under an MIT License
    range: function range(low, high, step) {
      // http://kevin.vanzonneveld.net
      // +   original by: Waldo Malqui Silva
      // *     example 1: range ( 0, 12 );
      // *     returns 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      // *     example 2: range( 0, 100, 10 );
      // *     returns 2: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      // *     example 3: range( 'a', 'i' );
      // *     returns 3: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
      // *     example 4: range( 'c', 'a' );
      // *     returns 4: ['c', 'b', 'a']
      var matrix = [];
      var inival;
      var endval;
      var walker = step || 1;
      var chars = false;

      if (!isNaN(low) && !isNaN(high)) {
        inival = parseInt(low, 10);
        endval = parseInt(high, 10);
      } else if (isNaN(low) && isNaN(high)) {
        chars = true;
        inival = low.charCodeAt(0);
        endval = high.charCodeAt(0);
      } else {
        inival = isNaN(low) ? 0 : low;
        endval = isNaN(high) ? 0 : high;
      }

      var plus = !(inival > endval);

      if (plus) {
        while (inival <= endval) {
          matrix.push(chars ? String.fromCharCode(inival) : inival);
          inival += walker;
        }
      } else {
        while (inival >= endval) {
          matrix.push(chars ? String.fromCharCode(inival) : inival);
          inival -= walker;
        }
      }

      return matrix;
    },
    cycle: function cycle(arr, i) {
      var pos = i % arr.length;
      return arr[pos];
    },
    dump: function dump() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      // Don't pass arguments to `Array.slice`, that is a performance killer
      var argsCopy = [].concat(args);
      var state = this;
      var EOL = '\n';
      var indentChar = '  ';
      var indentTimes = 0;
      var out = '';

      var indent = function indent(times) {
        var ind = '';

        while (times > 0) {
          times--;
          ind += indentChar;
        }

        return ind;
      };

      var displayVar = function displayVar(variable) {
        out += indent(indentTimes);

        if ((0, _typeof2["default"])(variable) === 'object') {
          dumpVar(variable);
        } else if (typeof variable === 'function') {
          out += 'function()' + EOL;
        } else if (typeof variable === 'string') {
          out += 'string(' + variable.length + ') "' + variable + '"' + EOL;
        } else if (typeof variable === 'number') {
          out += 'number(' + variable + ')' + EOL;
        } else if (typeof variable === 'boolean') {
          out += 'bool(' + variable + ')' + EOL;
        }
      };

      var dumpVar = function dumpVar(variable) {
        var i;

        if (variable === null) {
          out += 'NULL' + EOL;
        } else if (variable === undefined) {
          out += 'undefined' + EOL;
        } else if ((0, _typeof2["default"])(variable) === 'object') {
          out += indent(indentTimes) + (0, _typeof2["default"])(variable);
          indentTimes++;

          out += '(' + function (obj) {
            var size = 0;
            var key;

            for (key in obj) {
              if (Object.hasOwnProperty.call(obj, key)) {
                size++;
              }
            }

            return size;
          }(variable) + ') {' + EOL;

          for (i in variable) {
            if (Object.hasOwnProperty.call(variable, i)) {
              out += indent(indentTimes) + '[' + i + ']=> ' + EOL;
              displayVar(variable[i]);
            }
          }

          indentTimes--;
          out += indent(indentTimes) + '}' + EOL;
        } else {
          displayVar(variable);
        }
      }; // Handle no argument case by dumping the entire render context


      if (argsCopy.length === 0) {
        argsCopy.push(state.context);
      }

      argsCopy.forEach(function (variable) {
        dumpVar(variable);
      });
      return out;
    },
    date: function date(_date) {
      var dateObj;

      if (_date === undefined || _date === null || _date === '') {
        dateObj = new Date();
      } else if (Twig.lib.is('Date', _date)) {
        dateObj = _date;
      } else if (Twig.lib.is('String', _date)) {
        if (_date.match(/^\d+$/)) {
          dateObj = new Date(_date * 1000);
        } else {
          dateObj = new Date(Twig.lib.strtotime(_date) * 1000);
        }
      } else if (Twig.lib.is('Number', _date)) {
        // Timestamp
        dateObj = new Date(_date * 1000);
      } else {
        throw new Twig.Error('Unable to parse date ' + _date);
      }

      return dateObj;
    },
    block: function block(blockName) {
      var state = this;
      var block = state.getBlock(blockName);

      if (block !== undefined) {
        return block.render(state, state.context);
      }
    },
    parent: function parent() {
      var state = this;
      return state.getBlock(state.getNestingStackToken(Twig.logic.type.block).blockName, true).render(state, state.context);
    },
    attribute: function attribute(object, method, params) {
      if (Twig.lib.is('Object', object)) {
        if (Object.hasOwnProperty.call(object, method)) {
          if (typeof object[method] === 'function') {
            return object[method].apply(undefined, params);
          }

          return object[method];
        }
      } // Array will return element 0-index


      return object ? object[method] || undefined : undefined;
    },
    max: function max(values) {
      if (Twig.lib.is('Object', values)) {
        delete values._keys;
        return Twig.lib.max(values);
      }

      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      return Reflect.apply(Twig.lib.max, null, [values].concat(args));
    },
    min: function min(values) {
      if (Twig.lib.is('Object', values)) {
        delete values._keys;
        return Twig.lib.min(values);
      }

      for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
        args[_key3 - 1] = arguments[_key3];
      }

      return Reflect.apply(Twig.lib.min, null, [values].concat(args));
    },

    /* eslint-disable-next-line camelcase */
    template_from_string: function template_from_string(template) {
      var state = this;

      if (template === undefined) {
        template = '';
      }

      return Twig.Templates.parsers.twig({
        options: state.template.options,
        data: template
      });
    },
    random: function random(value) {
      var LIMIT_INT31 = 0x80000000;

      function getRandomNumber(n) {
        var random = Math.floor(Math.random() * LIMIT_INT31);
        var min = Math.min.call(null, 0, n);
        var max = Math.max.call(null, 0, n);
        return min + Math.floor((max - min + 1) * random / LIMIT_INT31);
      }

      if (Twig.lib.is('Number', value)) {
        return getRandomNumber(value);
      }

      if (Twig.lib.is('String', value)) {
        return value.charAt(getRandomNumber(value.length - 1));
      }

      if (Twig.lib.is('Array', value)) {
        return value[getRandomNumber(value.length - 1)];
      }

      if (Twig.lib.is('Object', value)) {
        var keys = Object.keys(value);
        return value[keys[getRandomNumber(keys.length - 1)]];
      }

      return getRandomNumber(LIMIT_INT31 - 1);
    },

    /**
     * Returns the content of a template without rendering it
     * @param {string} name
     * @param {boolean} [ignoreMissing=false]
     * @returns {string}
     */
    source: function source(name, ignoreMissing) {
      var templateSource;
      var templateFound = false;
      var isNodeEnvironment =  true && typeof module.exports !== 'undefined' && typeof window === 'undefined';
      var loader;
      var path = name; // If we are running in a node.js environment, set the loader to 'fs'.

      if (isNodeEnvironment) {
        loader = 'fs';
      } else {
        loader = 'ajax';
      } // Build the params object


      var params = {
        id: name,
        path: path,
        method: loader,
        parser: 'source',
        async: false,
        fetchTemplateSource: true
      }; // Default ignoreMissing to false

      if (typeof ignoreMissing === 'undefined') {
        ignoreMissing = false;
      } // Try to load the remote template
      //
      // on exception, log it


      try {
        templateSource = Twig.Templates.loadRemote(name, params); // If the template is undefined or null, set the template to an empty string and do NOT flip the
        // boolean indicating we found the template
        //
        // else, all is good! flip the boolean indicating we found the template

        if (typeof templateSource === 'undefined' || templateSource === null) {
          templateSource = '';
        } else {
          templateFound = true;
        }
      } catch (error) {
        Twig.log.debug('Twig.functions.source: ', 'Problem loading template  ', error);
      } // If the template was NOT found AND we are not ignoring missing templates, return the same message
      // that is returned by the PHP implementation of the twig source() function
      //
      // else, return the template source


      if (!templateFound && !ignoreMissing) {
        return TEMPLATE_NOT_FOUND_MESSAGE.replace('{name}', name);
      }

      return templateSource;
    }
  };

  Twig._function = function (_function, value, params) {
    if (!Twig.functions[_function]) {
      throw new Twig.Error('Unable to find function ' + _function);
    }

    return Twig.functions[_function](value, params);
  };

  Twig._function.extend = function (_function, definition) {
    Twig.functions[_function] = definition;
  };

  return Twig;
};

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.lib.js
//
// This file contains 3rd party libraries used within twig.
//
// Copies of the licenses for the code included here can be found in the
// LICENSES.md file.
//
module.exports = function (Twig) {
  // Namespace for libraries
  Twig.lib = {};
  Twig.lib.sprintf = __webpack_require__(4);
  Twig.lib.vsprintf = __webpack_require__(21);
  Twig.lib.round = __webpack_require__(22);
  Twig.lib.max = __webpack_require__(24);
  Twig.lib.min = __webpack_require__(25);
  Twig.lib.stripTags = __webpack_require__(26);
  Twig.lib.strtotime = __webpack_require__(28);
  Twig.lib.date = __webpack_require__(29);
  Twig.lib.boolval = __webpack_require__(30);

  Twig.lib.is = function (type, obj) {
    if (typeof obj === 'undefined' || obj === null) {
      return false;
    }

    switch (type) {
      case 'Array':
        return Array.isArray(obj);

      case 'Date':
        return obj instanceof Date;

      case 'String':
        return typeof obj === 'string' || obj instanceof String;

      case 'Number':
        return typeof obj === 'number' || obj instanceof Number;

      case 'Function':
        return typeof obj === 'function';

      case 'Object':
        return obj instanceof Object;

      default:
        return false;
    }
  };

  Twig.lib.replaceAll = function (string, search, replace) {
    // Escape possible regular expression syntax
    var searchEscaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return string.replace(new RegExp(searchEscaped, 'g'), replace);
  }; // Chunk an array (arr) into arrays of (size) items, returns an array of arrays, or an empty array on invalid input


  Twig.lib.chunkArray = function (arr, size) {
    var returnVal = [];
    var x = 0;
    var len = arr.length;

    if (size < 1 || !Array.isArray(arr)) {
      return [];
    }

    while (x < len) {
      returnVal.push(arr.slice(x, x += size));
    }

    return returnVal;
  };

  return Twig;
};

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function vsprintf(format, args) {
  //  discuss at: https://locutus.io/php/vsprintf/
  // original by: ejsanders
  //   example 1: vsprintf('%04d-%02d-%02d', [1988, 8, 1])
  //   returns 1: '1988-08-01'

  var sprintf = __webpack_require__(4);

  return sprintf.apply(this, [format].concat(args));
};


/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function roundToInt(value, mode) {
  var tmp = Math.floor(Math.abs(value) + 0.5);

  if (mode === 'PHP_ROUND_HALF_DOWN' && value === tmp - 0.5 || mode === 'PHP_ROUND_HALF_EVEN' && value === 0.5 + 2 * Math.floor(tmp / 2) || mode === 'PHP_ROUND_HALF_ODD' && value === 0.5 + 2 * Math.floor(tmp / 2) - 1) {
    tmp -= 1;
  }

  return value < 0 ? -tmp : tmp;
}

module.exports = function round(value) {
  var precision = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var mode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'PHP_ROUND_HALF_UP';

  //  discuss at: https://locutus.io/php/round/
  // original by: Philip Peterson
  //  revised by: Onno Marsman (https://twitter.com/onnomarsman)
  //  revised by: T.Wild
  //  revised by: Rafał Kukawski (https://blog.kukawski.pl)
  //    input by: Greenseed
  //    input by: meo
  //    input by: William
  //    input by: Josep Sanz (https://www.ws3.es/)
  // bugfixed by: Brett Zamir (https://brett-zamir.me)
  //  revised by: Rafał Kukawski
  //   example 1: round(1241757, -3)
  //   returns 1: 1242000
  //   example 2: round(3.6)
  //   returns 2: 4
  //   example 3: round(2.835, 2)
  //   returns 3: 2.84
  //   example 4: round(1.1749999999999, 2)
  //   returns 4: 1.17
  //   example 5: round(58551.799999999996, 2)
  //   returns 5: 58551.8
  //   example 6: round(4096.485, 2)
  //   returns 6: 4096.49

  var floatCast = __webpack_require__(23);
  var intCast = __webpack_require__(5);
  var p;

  // the code is heavily based on the native PHP implementation
  // https://github.com/php/php-src/blob/PHP-7.4/ext/standard/math.c#L355

  value = floatCast(value);
  precision = intCast(precision);
  p = Math.pow(10, precision);

  if (isNaN(value) || !isFinite(value)) {
    return value;
  }

  // if value already integer and positive precision
  // then nothing to do, return early
  if (Math.trunc(value) === value && precision >= 0) {
    return value;
  }

  // PHP does a pre-rounding before rounding to desired precision
  // https://wiki.php.net/rfc/rounding#pre-rounding_to_the_value_s_precision_if_possible
  var preRoundPrecision = 14 - Math.floor(Math.log10(Math.abs(value)));

  if (preRoundPrecision > precision && preRoundPrecision - 15 < precision) {
    value = roundToInt(value * Math.pow(10, preRoundPrecision), mode);
    value /= Math.pow(10, Math.abs(precision - preRoundPrecision));
  } else {
    value *= p;
  }

  value = roundToInt(value, mode);

  return value / p;
};


/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function _php_cast_float(value) {
  // eslint-disable-line camelcase
  // original by: Rafał Kukawski
  //   example 1: _php_cast_float(false)
  //   returns 1: 0
  //   example 2: _php_cast_float(true)
  //   returns 2: 1
  //   example 3: _php_cast_float(0)
  //   returns 3: 0
  //   example 4: _php_cast_float(1)
  //   returns 4: 1
  //   example 5: _php_cast_float(3.14)
  //   returns 5: 3.14
  //   example 6: _php_cast_float('')
  //   returns 6: 0
  //   example 7: _php_cast_float('0')
  //   returns 7: 0
  //   example 8: _php_cast_float('abc')
  //   returns 8: 0
  //   example 9: _php_cast_float(null)
  //   returns 9: 0
  //  example 10: _php_cast_float(undefined)
  //  returns 10: 0
  //  example 11: _php_cast_float('123abc')
  //  returns 11: 123
  //  example 12: _php_cast_float('123e4')
  //  returns 12: 1230000
  //  example 13: _php_cast_float(0x200000001)
  //  returns 13: 8589934593
  //  example 14: _php_cast_float('3.14abc')
  //  returns 14: 3.14

  var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);

  switch (type) {
    case 'number':
      return value;
    case 'string':
      return parseFloat(value) || 0;
    case 'boolean':
    // fall through
    default:
      // PHP docs state, that for types other than string
      // conversion is {input type}->int->float
      return __webpack_require__(5)(value);
  }
};


/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function max() {
  //  discuss at: https://locutus.io/php/max/
  // original by: Onno Marsman (https://twitter.com/onnomarsman)
  //  revised by: Onno Marsman (https://twitter.com/onnomarsman)
  // improved by: Jack
  //      note 1: Long code cause we're aiming for maximum PHP compatibility
  //   example 1: max(1, 3, 5, 6, 7)
  //   returns 1: 7
  //   example 2: max([2, 4, 5])
  //   returns 2: 5
  //   example 3: max(0, 'hello')
  //   returns 3: 0
  //   example 4: max('hello', 0)
  //   returns 4: 'hello'
  //   example 5: max(-1, 'hello')
  //   returns 5: 'hello'
  //   example 6: max([2, 4, 8], [2, 5, 7])
  //   returns 6: [2, 5, 7]

  var ar;
  var retVal;
  var i = 0;
  var n = 0;
  var argv = arguments;
  var argc = argv.length;
  var _obj2Array = function _obj2Array(obj) {
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      return obj;
    } else {
      var ar = [];
      for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
          ar.push(obj[i]);
        }
      }
      return ar;
    }
  };
  var _compare = function _compare(current, next) {
    var i = 0;
    var n = 0;
    var tmp = 0;
    var nl = 0;
    var cl = 0;

    if (current === next) {
      return 0;
    } else if ((typeof current === 'undefined' ? 'undefined' : _typeof(current)) === 'object') {
      if ((typeof next === 'undefined' ? 'undefined' : _typeof(next)) === 'object') {
        current = _obj2Array(current);
        next = _obj2Array(next);
        cl = current.length;
        nl = next.length;
        if (nl > cl) {
          return 1;
        } else if (nl < cl) {
          return -1;
        }
        for (i = 0, n = cl; i < n; ++i) {
          tmp = _compare(current[i], next[i]);
          if (tmp === 1) {
            return 1;
          } else if (tmp === -1) {
            return -1;
          }
        }
        return 0;
      }
      return -1;
    } else if ((typeof next === 'undefined' ? 'undefined' : _typeof(next)) === 'object') {
      return 1;
    } else if (isNaN(next) && !isNaN(current)) {
      if (current === 0) {
        return 0;
      }
      return current < 0 ? 1 : -1;
    } else if (isNaN(current) && !isNaN(next)) {
      if (next === 0) {
        return 0;
      }
      return next > 0 ? 1 : -1;
    }

    if (next === current) {
      return 0;
    }

    return next > current ? 1 : -1;
  };

  if (argc === 0) {
    throw new Error('At least one value should be passed to max()');
  } else if (argc === 1) {
    if (_typeof(argv[0]) === 'object') {
      ar = _obj2Array(argv[0]);
    } else {
      throw new Error('Wrong parameter count for max()');
    }
    if (ar.length === 0) {
      throw new Error('Array must contain at least one element for max()');
    }
  } else {
    ar = argv;
  }

  retVal = ar[0];
  for (i = 1, n = ar.length; i < n; ++i) {
    if (_compare(retVal, ar[i]) === 1) {
      retVal = ar[i];
    }
  }

  return retVal;
};


/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function min() {
  //  discuss at: https://locutus.io/php/min/
  // original by: Onno Marsman (https://twitter.com/onnomarsman)
  //  revised by: Onno Marsman (https://twitter.com/onnomarsman)
  // improved by: Jack
  //      note 1: Long code cause we're aiming for maximum PHP compatibility
  //   example 1: min(1, 3, 5, 6, 7)
  //   returns 1: 1
  //   example 2: min([2, 4, 5])
  //   returns 2: 2
  //   example 3: min(0, 'hello')
  //   returns 3: 0
  //   example 4: min('hello', 0)
  //   returns 4: 'hello'
  //   example 5: min(-1, 'hello')
  //   returns 5: -1
  //   example 6: min([2, 4, 8], [2, 5, 7])
  //   returns 6: [2, 4, 8]

  var ar;
  var retVal;
  var i = 0;
  var n = 0;
  var argv = arguments;
  var argc = argv.length;
  var _obj2Array = function _obj2Array(obj) {
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      return obj;
    }
    var ar = [];
    for (var i in obj) {
      if (obj.hasOwnProperty(i)) {
        ar.push(obj[i]);
      }
    }
    return ar;
  };

  var _compare = function _compare(current, next) {
    var i = 0;
    var n = 0;
    var tmp = 0;
    var nl = 0;
    var cl = 0;

    if (current === next) {
      return 0;
    } else if ((typeof current === 'undefined' ? 'undefined' : _typeof(current)) === 'object') {
      if ((typeof next === 'undefined' ? 'undefined' : _typeof(next)) === 'object') {
        current = _obj2Array(current);
        next = _obj2Array(next);
        cl = current.length;
        nl = next.length;
        if (nl > cl) {
          return 1;
        } else if (nl < cl) {
          return -1;
        }
        for (i = 0, n = cl; i < n; ++i) {
          tmp = _compare(current[i], next[i]);
          if (tmp === 1) {
            return 1;
          } else if (tmp === -1) {
            return -1;
          }
        }
        return 0;
      }
      return -1;
    } else if ((typeof next === 'undefined' ? 'undefined' : _typeof(next)) === 'object') {
      return 1;
    } else if (isNaN(next) && !isNaN(current)) {
      if (current === 0) {
        return 0;
      }
      return current < 0 ? 1 : -1;
    } else if (isNaN(current) && !isNaN(next)) {
      if (next === 0) {
        return 0;
      }
      return next > 0 ? 1 : -1;
    }

    if (next === current) {
      return 0;
    }

    return next > current ? 1 : -1;
  };

  if (argc === 0) {
    throw new Error('At least one value should be passed to min()');
  } else if (argc === 1) {
    if (_typeof(argv[0]) === 'object') {
      ar = _obj2Array(argv[0]);
    } else {
      throw new Error('Wrong parameter count for min()');
    }

    if (ar.length === 0) {
      throw new Error('Array must contain at least one element for min()');
    }
  } else {
    ar = argv;
  }

  retVal = ar[0];

  for (i = 1, n = ar.length; i < n; ++i) {
    if (_compare(retVal, ar[i]) === -1) {
      retVal = ar[i];
    }
  }

  return retVal;
};


/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function strip_tags(input, allowed) {
  // eslint-disable-line camelcase
  //  discuss at: https://locutus.io/php/strip_tags/
  // original by: Kevin van Zonneveld (https://kvz.io)
  // improved by: Luke Godfrey
  // improved by: Kevin van Zonneveld (https://kvz.io)
  //    input by: Pul
  //    input by: Alex
  //    input by: Marc Palau
  //    input by: Brett Zamir (https://brett-zamir.me)
  //    input by: Bobby Drake
  //    input by: Evertjan Garretsen
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: Onno Marsman (https://twitter.com/onnomarsman)
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: Eric Nagel
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: Tomasz Wesolowski
  // bugfixed by: Tymon Sturgeon (https://scryptonite.com)
  // bugfixed by: Tim de Koning (https://www.kingsquare.nl)
  //  revised by: Rafał Kukawski (https://blog.kukawski.pl)
  //   example 1: strip_tags('<p>Kevin</p> <br /><b>van</b> <i>Zonneveld</i>', '<i><b>')
  //   returns 1: 'Kevin <b>van</b> <i>Zonneveld</i>'
  //   example 2: strip_tags('<p>Kevin <img src="someimage.png" onmouseover="someFunction()">van <i>Zonneveld</i></p>', '<p>')
  //   returns 2: '<p>Kevin van Zonneveld</p>'
  //   example 3: strip_tags("<a href='https://kvz.io'>Kevin van Zonneveld</a>", "<a>")
  //   returns 3: "<a href='https://kvz.io'>Kevin van Zonneveld</a>"
  //   example 4: strip_tags('1 < 5 5 > 1')
  //   returns 4: '1 < 5 5 > 1'
  //   example 5: strip_tags('1 <br/> 1')
  //   returns 5: '1  1'
  //   example 6: strip_tags('1 <br/> 1', '<br>')
  //   returns 6: '1 <br/> 1'
  //   example 7: strip_tags('1 <br/> 1', '<br><br/>')
  //   returns 7: '1 <br/> 1'
  //   example 8: strip_tags('<i>hello</i> <<foo>script>world<</foo>/script>')
  //   returns 8: 'hello world'
  //   example 9: strip_tags(4)
  //   returns 9: '4'

  var _phpCastString = __webpack_require__(27);

  // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
  allowed = (((allowed || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('');

  var tags = /<\/?([a-z0-9]*)\b[^>]*>?/gi;
  var commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;

  var after = _phpCastString(input);
  // removes tha '<' char at the end of the string to replicate PHP's behaviour
  after = after.substring(after.length - 1) === '<' ? after.substring(0, after.length - 1) : after;

  // recursively remove tags to ensure that the returned string doesn't contain forbidden tags after previous passes (e.g. '<<bait/>switch/>')
  while (true) {
    var before = after;
    after = before.replace(commentsAndPhpTags, '').replace(tags, function ($0, $1) {
      return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
    });

    // return once no more tags are removed
    if (before === after) {
      return after;
    }
  }
};


/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function _phpCastString(value) {
  // original by: Rafał Kukawski
  //   example 1: _phpCastString(true)
  //   returns 1: '1'
  //   example 2: _phpCastString(false)
  //   returns 2: ''
  //   example 3: _phpCastString('foo')
  //   returns 3: 'foo'
  //   example 4: _phpCastString(0/0)
  //   returns 4: 'NAN'
  //   example 5: _phpCastString(1/0)
  //   returns 5: 'INF'
  //   example 6: _phpCastString(-1/0)
  //   returns 6: '-INF'
  //   example 7: _phpCastString(null)
  //   returns 7: ''
  //   example 8: _phpCastString(undefined)
  //   returns 8: ''
  //   example 9: _phpCastString([])
  //   returns 9: 'Array'
  //   example 10: _phpCastString({})
  //   returns 10: 'Object'
  //   example 11: _phpCastString(0)
  //   returns 11: '0'
  //   example 12: _phpCastString(1)
  //   returns 12: '1'
  //   example 13: _phpCastString(3.14)
  //   returns 13: '3.14'

  var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);

  switch (type) {
    case 'boolean':
      return value ? '1' : '';
    case 'string':
      return value;
    case 'number':
      if (isNaN(value)) {
        return 'NAN';
      }

      if (!isFinite(value)) {
        return (value < 0 ? '-' : '') + 'INF';
      }

      return value + '';
    case 'undefined':
      return '';
    case 'object':
      if (Array.isArray(value)) {
        return 'Array';
      }

      if (value !== null) {
        return 'Object';
      }

      return '';
    case 'function':
    // fall through
    default:
      throw new Error('Unsupported value type');
  }
};


/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var reSpace = '[ \\t]+';
var reSpaceOpt = '[ \\t]*';
var reMeridian = '(?:([ap])\\.?m\\.?([\\t ]|$))';
var reHour24 = '(2[0-4]|[01]?[0-9])';
var reHour24lz = '([01][0-9]|2[0-4])';
var reHour12 = '(0?[1-9]|1[0-2])';
var reMinute = '([0-5]?[0-9])';
var reMinutelz = '([0-5][0-9])';
var reSecond = '(60|[0-5]?[0-9])';
var reSecondlz = '(60|[0-5][0-9])';
var reFrac = '(?:\\.([0-9]+))';

var reDayfull = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
var reDayabbr = 'sun|mon|tue|wed|thu|fri|sat';
var reDaytext = reDayfull + '|' + reDayabbr + '|weekdays?';

var reReltextnumber = 'first|second|third|fourth|fifth|sixth|seventh|eighth?|ninth|tenth|eleventh|twelfth';
var reReltexttext = 'next|last|previous|this';
var reReltextunit = '(?:second|sec|minute|min|hour|day|fortnight|forthnight|month|year)s?|weeks|' + reDaytext;

var reYear = '([0-9]{1,4})';
var reYear2 = '([0-9]{2})';
var reYear4 = '([0-9]{4})';
var reYear4withSign = '([+-]?[0-9]{4})';
var reMonth = '(1[0-2]|0?[0-9])';
var reMonthlz = '(0[0-9]|1[0-2])';
var reDay = '(?:(3[01]|[0-2]?[0-9])(?:st|nd|rd|th)?)';
var reDaylz = '(0[0-9]|[1-2][0-9]|3[01])';

var reMonthFull = 'january|february|march|april|may|june|july|august|september|october|november|december';
var reMonthAbbr = 'jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec';
var reMonthroman = 'i[vx]|vi{0,3}|xi{0,2}|i{1,3}';
var reMonthText = '(' + reMonthFull + '|' + reMonthAbbr + '|' + reMonthroman + ')';

var reTzCorrection = '((?:GMT)?([+-])' + reHour24 + ':?' + reMinute + '?)';
var reDayOfYear = '(00[1-9]|0[1-9][0-9]|[12][0-9][0-9]|3[0-5][0-9]|36[0-6])';
var reWeekOfYear = '(0[1-9]|[1-4][0-9]|5[0-3])';

var reDateNoYear = reMonthText + '[ .\\t-]*' + reDay + '[,.stndrh\\t ]*';

function processMeridian(hour, meridian) {
  meridian = meridian && meridian.toLowerCase();

  switch (meridian) {
    case 'a':
      hour += hour === 12 ? -12 : 0;
      break;
    case 'p':
      hour += hour !== 12 ? 12 : 0;
      break;
  }

  return hour;
}

function processYear(yearStr) {
  var year = +yearStr;

  if (yearStr.length < 4 && year < 100) {
    year += year < 70 ? 2000 : 1900;
  }

  return year;
}

function lookupMonth(monthStr) {
  return {
    jan: 0,
    january: 0,
    i: 0,
    feb: 1,
    february: 1,
    ii: 1,
    mar: 2,
    march: 2,
    iii: 2,
    apr: 3,
    april: 3,
    iv: 3,
    may: 4,
    v: 4,
    jun: 5,
    june: 5,
    vi: 5,
    jul: 6,
    july: 6,
    vii: 6,
    aug: 7,
    august: 7,
    viii: 7,
    sep: 8,
    sept: 8,
    september: 8,
    ix: 8,
    oct: 9,
    october: 9,
    x: 9,
    nov: 10,
    november: 10,
    xi: 10,
    dec: 11,
    december: 11,
    xii: 11
  }[monthStr.toLowerCase()];
}

function lookupWeekday(dayStr) {
  var desiredSundayNumber = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

  var dayNumbers = {
    mon: 1,
    monday: 1,
    tue: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 0,
    sunday: 0
  };

  return dayNumbers[dayStr.toLowerCase()] || desiredSundayNumber;
}

function lookupRelative(relText) {
  var relativeNumbers = {
    last: -1,
    previous: -1,
    this: 0,
    first: 1,
    next: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eight: 8,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12
  };

  var relativeBehavior = {
    this: 1
  };

  var relTextLower = relText.toLowerCase();

  return {
    amount: relativeNumbers[relTextLower],
    behavior: relativeBehavior[relTextLower] || 0
  };
}

function processTzCorrection(tzOffset, oldValue) {
  var reTzCorrectionLoose = /(?:GMT)?([+-])(\d+)(:?)(\d{0,2})/i;
  tzOffset = tzOffset && tzOffset.match(reTzCorrectionLoose);

  if (!tzOffset) {
    return oldValue;
  }

  var sign = tzOffset[1] === '-' ? 1 : -1;
  var hours = +tzOffset[2];
  var minutes = +tzOffset[4];

  if (!tzOffset[4] && !tzOffset[3]) {
    minutes = Math.floor(hours % 100);
    hours = Math.floor(hours / 100);
  }

  return sign * (hours * 60 + minutes);
}

var formats = {
  yesterday: {
    regex: /^yesterday/i,
    name: 'yesterday',
    callback: function callback() {
      this.rd -= 1;
      return this.resetTime();
    }
  },

  now: {
    regex: /^now/i,
    name: 'now'
    // do nothing
  },

  noon: {
    regex: /^noon/i,
    name: 'noon',
    callback: function callback() {
      return this.resetTime() && this.time(12, 0, 0, 0);
    }
  },

  midnightOrToday: {
    regex: /^(midnight|today)/i,
    name: 'midnight | today',
    callback: function callback() {
      return this.resetTime();
    }
  },

  tomorrow: {
    regex: /^tomorrow/i,
    name: 'tomorrow',
    callback: function callback() {
      this.rd += 1;
      return this.resetTime();
    }
  },

  timestamp: {
    regex: /^@(-?\d+)/i,
    name: 'timestamp',
    callback: function callback(match, timestamp) {
      this.rs += +timestamp;
      this.y = 1970;
      this.m = 0;
      this.d = 1;
      this.dates = 0;

      return this.resetTime() && this.zone(0);
    }
  },

  firstOrLastDay: {
    regex: /^(first|last) day of/i,
    name: 'firstdayof | lastdayof',
    callback: function callback(match, day) {
      if (day.toLowerCase() === 'first') {
        this.firstOrLastDayOfMonth = 1;
      } else {
        this.firstOrLastDayOfMonth = -1;
      }
    }
  },

  backOrFrontOf: {
    regex: RegExp('^(back|front) of ' + reHour24 + reSpaceOpt + reMeridian + '?', 'i'),
    name: 'backof | frontof',
    callback: function callback(match, side, hours, meridian) {
      var back = side.toLowerCase() === 'back';
      var hour = +hours;
      var minute = 15;

      if (!back) {
        hour -= 1;
        minute = 45;
      }

      hour = processMeridian(hour, meridian);

      return this.resetTime() && this.time(hour, minute, 0, 0);
    }
  },

  weekdayOf: {
    regex: RegExp('^(' + reReltextnumber + '|' + reReltexttext + ')' + reSpace + '(' + reDayfull + '|' + reDayabbr + ')' + reSpace + 'of', 'i'),
    name: 'weekdayof'
    // todo
  },

  mssqltime: {
    regex: RegExp('^' + reHour12 + ':' + reMinutelz + ':' + reSecondlz + '[:.]([0-9]+)' + reMeridian, 'i'),
    name: 'mssqltime',
    callback: function callback(match, hour, minute, second, frac, meridian) {
      return this.time(processMeridian(+hour, meridian), +minute, +second, +frac.substr(0, 3));
    }
  },

  timeLong12: {
    regex: RegExp('^' + reHour12 + '[:.]' + reMinute + '[:.]' + reSecondlz + reSpaceOpt + reMeridian, 'i'),
    name: 'timelong12',
    callback: function callback(match, hour, minute, second, meridian) {
      return this.time(processMeridian(+hour, meridian), +minute, +second, 0);
    }
  },

  timeShort12: {
    regex: RegExp('^' + reHour12 + '[:.]' + reMinutelz + reSpaceOpt + reMeridian, 'i'),
    name: 'timeshort12',
    callback: function callback(match, hour, minute, meridian) {
      return this.time(processMeridian(+hour, meridian), +minute, 0, 0);
    }
  },

  timeTiny12: {
    regex: RegExp('^' + reHour12 + reSpaceOpt + reMeridian, 'i'),
    name: 'timetiny12',
    callback: function callback(match, hour, meridian) {
      return this.time(processMeridian(+hour, meridian), 0, 0, 0);
    }
  },

  soap: {
    regex: RegExp('^' + reYear4 + '-' + reMonthlz + '-' + reDaylz + 'T' + reHour24lz + ':' + reMinutelz + ':' + reSecondlz + reFrac + reTzCorrection + '?', 'i'),
    name: 'soap',
    callback: function callback(match, year, month, day, hour, minute, second, frac, tzCorrection) {
      return this.ymd(+year, month - 1, +day) && this.time(+hour, +minute, +second, +frac.substr(0, 3)) && this.zone(processTzCorrection(tzCorrection));
    }
  },

  wddx: {
    regex: RegExp('^' + reYear4 + '-' + reMonth + '-' + reDay + 'T' + reHour24 + ':' + reMinute + ':' + reSecond),
    name: 'wddx',
    callback: function callback(match, year, month, day, hour, minute, second) {
      return this.ymd(+year, month - 1, +day) && this.time(+hour, +minute, +second, 0);
    }
  },

  exif: {
    regex: RegExp('^' + reYear4 + ':' + reMonthlz + ':' + reDaylz + ' ' + reHour24lz + ':' + reMinutelz + ':' + reSecondlz, 'i'),
    name: 'exif',
    callback: function callback(match, year, month, day, hour, minute, second) {
      return this.ymd(+year, month - 1, +day) && this.time(+hour, +minute, +second, 0);
    }
  },

  xmlRpc: {
    regex: RegExp('^' + reYear4 + reMonthlz + reDaylz + 'T' + reHour24 + ':' + reMinutelz + ':' + reSecondlz),
    name: 'xmlrpc',
    callback: function callback(match, year, month, day, hour, minute, second) {
      return this.ymd(+year, month - 1, +day) && this.time(+hour, +minute, +second, 0);
    }
  },

  xmlRpcNoColon: {
    regex: RegExp('^' + reYear4 + reMonthlz + reDaylz + '[Tt]' + reHour24 + reMinutelz + reSecondlz),
    name: 'xmlrpcnocolon',
    callback: function callback(match, year, month, day, hour, minute, second) {
      return this.ymd(+year, month - 1, +day) && this.time(+hour, +minute, +second, 0);
    }
  },

  clf: {
    regex: RegExp('^' + reDay + '/(' + reMonthAbbr + ')/' + reYear4 + ':' + reHour24lz + ':' + reMinutelz + ':' + reSecondlz + reSpace + reTzCorrection, 'i'),
    name: 'clf',
    callback: function callback(match, day, month, year, hour, minute, second, tzCorrection) {
      return this.ymd(+year, lookupMonth(month), +day) && this.time(+hour, +minute, +second, 0) && this.zone(processTzCorrection(tzCorrection));
    }
  },

  iso8601long: {
    regex: RegExp('^t?' + reHour24 + '[:.]' + reMinute + '[:.]' + reSecond + reFrac, 'i'),
    name: 'iso8601long',
    callback: function callback(match, hour, minute, second, frac) {
      return this.time(+hour, +minute, +second, +frac.substr(0, 3));
    }
  },

  dateTextual: {
    regex: RegExp('^' + reMonthText + '[ .\\t-]*' + reDay + '[,.stndrh\\t ]+' + reYear, 'i'),
    name: 'datetextual',
    callback: function callback(match, month, day, year) {
      return this.ymd(processYear(year), lookupMonth(month), +day);
    }
  },

  pointedDate4: {
    regex: RegExp('^' + reDay + '[.\\t-]' + reMonth + '[.-]' + reYear4),
    name: 'pointeddate4',
    callback: function callback(match, day, month, year) {
      return this.ymd(+year, month - 1, +day);
    }
  },

  pointedDate2: {
    regex: RegExp('^' + reDay + '[.\\t]' + reMonth + '\\.' + reYear2),
    name: 'pointeddate2',
    callback: function callback(match, day, month, year) {
      return this.ymd(processYear(year), month - 1, +day);
    }
  },

  timeLong24: {
    regex: RegExp('^t?' + reHour24 + '[:.]' + reMinute + '[:.]' + reSecond),
    name: 'timelong24',
    callback: function callback(match, hour, minute, second) {
      return this.time(+hour, +minute, +second, 0);
    }
  },

  dateNoColon: {
    regex: RegExp('^' + reYear4 + reMonthlz + reDaylz),
    name: 'datenocolon',
    callback: function callback(match, year, month, day) {
      return this.ymd(+year, month - 1, +day);
    }
  },

  pgydotd: {
    regex: RegExp('^' + reYear4 + '\\.?' + reDayOfYear),
    name: 'pgydotd',
    callback: function callback(match, year, day) {
      return this.ymd(+year, 0, +day);
    }
  },

  timeShort24: {
    regex: RegExp('^t?' + reHour24 + '[:.]' + reMinute, 'i'),
    name: 'timeshort24',
    callback: function callback(match, hour, minute) {
      return this.time(+hour, +minute, 0, 0);
    }
  },

  iso8601noColon: {
    regex: RegExp('^t?' + reHour24lz + reMinutelz + reSecondlz, 'i'),
    name: 'iso8601nocolon',
    callback: function callback(match, hour, minute, second) {
      return this.time(+hour, +minute, +second, 0);
    }
  },

  iso8601dateSlash: {
    // eventhough the trailing slash is optional in PHP
    // here it's mandatory and inputs without the slash
    // are handled by dateslash
    regex: RegExp('^' + reYear4 + '/' + reMonthlz + '/' + reDaylz + '/'),
    name: 'iso8601dateslash',
    callback: function callback(match, year, month, day) {
      return this.ymd(+year, month - 1, +day);
    }
  },

  dateSlash: {
    regex: RegExp('^' + reYear4 + '/' + reMonth + '/' + reDay),
    name: 'dateslash',
    callback: function callback(match, year, month, day) {
      return this.ymd(+year, month - 1, +day);
    }
  },

  american: {
    regex: RegExp('^' + reMonth + '/' + reDay + '/' + reYear),
    name: 'american',
    callback: function callback(match, month, day, year) {
      return this.ymd(processYear(year), month - 1, +day);
    }
  },

  americanShort: {
    regex: RegExp('^' + reMonth + '/' + reDay),
    name: 'americanshort',
    callback: function callback(match, month, day) {
      return this.ymd(this.y, month - 1, +day);
    }
  },

  gnuDateShortOrIso8601date2: {
    // iso8601date2 is complete subset of gnudateshort
    regex: RegExp('^' + reYear + '-' + reMonth + '-' + reDay),
    name: 'gnudateshort | iso8601date2',
    callback: function callback(match, year, month, day) {
      return this.ymd(processYear(year), month - 1, +day);
    }
  },

  iso8601date4: {
    regex: RegExp('^' + reYear4withSign + '-' + reMonthlz + '-' + reDaylz),
    name: 'iso8601date4',
    callback: function callback(match, year, month, day) {
      return this.ymd(+year, month - 1, +day);
    }
  },

  gnuNoColon: {
    regex: RegExp('^t?' + reHour24lz + reMinutelz, 'i'),
    name: 'gnunocolon',
    callback: function callback(match, hour, minute) {
      // this rule is a special case
      // if time was already set once by any preceding rule, it sets the captured value as year
      switch (this.times) {
        case 0:
          return this.time(+hour, +minute, 0, this.f);
        case 1:
          this.y = hour * 100 + +minute;
          this.times++;

          return true;
        default:
          return false;
      }
    }
  },

  gnuDateShorter: {
    regex: RegExp('^' + reYear4 + '-' + reMonth),
    name: 'gnudateshorter',
    callback: function callback(match, year, month) {
      return this.ymd(+year, month - 1, 1);
    }
  },

  pgTextReverse: {
    // note: allowed years are from 32-9999
    // years below 32 should be treated as days in datefull
    regex: RegExp('^' + '(\\d{3,4}|[4-9]\\d|3[2-9])-(' + reMonthAbbr + ')-' + reDaylz, 'i'),
    name: 'pgtextreverse',
    callback: function callback(match, year, month, day) {
      return this.ymd(processYear(year), lookupMonth(month), +day);
    }
  },

  dateFull: {
    regex: RegExp('^' + reDay + '[ \\t.-]*' + reMonthText + '[ \\t.-]*' + reYear, 'i'),
    name: 'datefull',
    callback: function callback(match, day, month, year) {
      return this.ymd(processYear(year), lookupMonth(month), +day);
    }
  },

  dateNoDay: {
    regex: RegExp('^' + reMonthText + '[ .\\t-]*' + reYear4, 'i'),
    name: 'datenoday',
    callback: function callback(match, month, year) {
      return this.ymd(+year, lookupMonth(month), 1);
    }
  },

  dateNoDayRev: {
    regex: RegExp('^' + reYear4 + '[ .\\t-]*' + reMonthText, 'i'),
    name: 'datenodayrev',
    callback: function callback(match, year, month) {
      return this.ymd(+year, lookupMonth(month), 1);
    }
  },

  pgTextShort: {
    regex: RegExp('^(' + reMonthAbbr + ')-' + reDaylz + '-' + reYear, 'i'),
    name: 'pgtextshort',
    callback: function callback(match, month, day, year) {
      return this.ymd(processYear(year), lookupMonth(month), +day);
    }
  },

  dateNoYear: {
    regex: RegExp('^' + reDateNoYear, 'i'),
    name: 'datenoyear',
    callback: function callback(match, month, day) {
      return this.ymd(this.y, lookupMonth(month), +day);
    }
  },

  dateNoYearRev: {
    regex: RegExp('^' + reDay + '[ .\\t-]*' + reMonthText, 'i'),
    name: 'datenoyearrev',
    callback: function callback(match, day, month) {
      return this.ymd(this.y, lookupMonth(month), +day);
    }
  },

  isoWeekDay: {
    regex: RegExp('^' + reYear4 + '-?W' + reWeekOfYear + '(?:-?([0-7]))?'),
    name: 'isoweekday | isoweek',
    callback: function callback(match, year, week, day) {
      day = day ? +day : 1;

      if (!this.ymd(+year, 0, 1)) {
        return false;
      }

      // get day of week for Jan 1st
      var dayOfWeek = new Date(this.y, this.m, this.d).getDay();

      // and use the day to figure out the offset for day 1 of week 1
      dayOfWeek = 0 - (dayOfWeek > 4 ? dayOfWeek - 7 : dayOfWeek);

      this.rd += dayOfWeek + (week - 1) * 7 + day;
    }
  },

  relativeText: {
    regex: RegExp('^(' + reReltextnumber + '|' + reReltexttext + ')' + reSpace + '(' + reReltextunit + ')', 'i'),
    name: 'relativetext',
    callback: function callback(match, relValue, relUnit) {
      // todo: implement handling of 'this time-unit'
      // eslint-disable-next-line no-unused-vars
      var _lookupRelative = lookupRelative(relValue),
          amount = _lookupRelative.amount,
          behavior = _lookupRelative.behavior;

      switch (relUnit.toLowerCase()) {
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
          this.rs += amount;
          break;
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          this.ri += amount;
          break;
        case 'hour':
        case 'hours':
          this.rh += amount;
          break;
        case 'day':
        case 'days':
          this.rd += amount;
          break;
        case 'fortnight':
        case 'fortnights':
        case 'forthnight':
        case 'forthnights':
          this.rd += amount * 14;
          break;
        case 'week':
        case 'weeks':
          this.rd += amount * 7;
          break;
        case 'month':
        case 'months':
          this.rm += amount;
          break;
        case 'year':
        case 'years':
          this.ry += amount;
          break;
        case 'mon':case 'monday':
        case 'tue':case 'tuesday':
        case 'wed':case 'wednesday':
        case 'thu':case 'thursday':
        case 'fri':case 'friday':
        case 'sat':case 'saturday':
        case 'sun':case 'sunday':
          this.resetTime();
          this.weekday = lookupWeekday(relUnit, 7);
          this.weekdayBehavior = 1;
          this.rd += (amount > 0 ? amount - 1 : amount) * 7;
          break;
        case 'weekday':
        case 'weekdays':
          // todo
          break;
      }
    }
  },

  relative: {
    regex: RegExp('^([+-]*)[ \\t]*(\\d+)' + reSpaceOpt + '(' + reReltextunit + '|week)', 'i'),
    name: 'relative',
    callback: function callback(match, signs, relValue, relUnit) {
      var minuses = signs.replace(/[^-]/g, '').length;

      var amount = +relValue * Math.pow(-1, minuses);

      switch (relUnit.toLowerCase()) {
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
          this.rs += amount;
          break;
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          this.ri += amount;
          break;
        case 'hour':
        case 'hours':
          this.rh += amount;
          break;
        case 'day':
        case 'days':
          this.rd += amount;
          break;
        case 'fortnight':
        case 'fortnights':
        case 'forthnight':
        case 'forthnights':
          this.rd += amount * 14;
          break;
        case 'week':
        case 'weeks':
          this.rd += amount * 7;
          break;
        case 'month':
        case 'months':
          this.rm += amount;
          break;
        case 'year':
        case 'years':
          this.ry += amount;
          break;
        case 'mon':case 'monday':
        case 'tue':case 'tuesday':
        case 'wed':case 'wednesday':
        case 'thu':case 'thursday':
        case 'fri':case 'friday':
        case 'sat':case 'saturday':
        case 'sun':case 'sunday':
          this.resetTime();
          this.weekday = lookupWeekday(relUnit, 7);
          this.weekdayBehavior = 1;
          this.rd += (amount > 0 ? amount - 1 : amount) * 7;
          break;
        case 'weekday':
        case 'weekdays':
          // todo
          break;
      }
    }
  },

  dayText: {
    regex: RegExp('^(' + reDaytext + ')', 'i'),
    name: 'daytext',
    callback: function callback(match, dayText) {
      this.resetTime();
      this.weekday = lookupWeekday(dayText, 0);

      if (this.weekdayBehavior !== 2) {
        this.weekdayBehavior = 1;
      }
    }
  },

  relativeTextWeek: {
    regex: RegExp('^(' + reReltexttext + ')' + reSpace + 'week', 'i'),
    name: 'relativetextweek',
    callback: function callback(match, relText) {
      this.weekdayBehavior = 2;

      switch (relText.toLowerCase()) {
        case 'this':
          this.rd += 0;
          break;
        case 'next':
          this.rd += 7;
          break;
        case 'last':
        case 'previous':
          this.rd -= 7;
          break;
      }

      if (isNaN(this.weekday)) {
        this.weekday = 1;
      }
    }
  },

  monthFullOrMonthAbbr: {
    regex: RegExp('^(' + reMonthFull + '|' + reMonthAbbr + ')', 'i'),
    name: 'monthfull | monthabbr',
    callback: function callback(match, month) {
      return this.ymd(this.y, lookupMonth(month), this.d);
    }
  },

  tzCorrection: {
    regex: RegExp('^' + reTzCorrection, 'i'),
    name: 'tzcorrection',
    callback: function callback(tzCorrection) {
      return this.zone(processTzCorrection(tzCorrection));
    }
  },

  ago: {
    regex: /^ago/i,
    name: 'ago',
    callback: function callback() {
      this.ry = -this.ry;
      this.rm = -this.rm;
      this.rd = -this.rd;
      this.rh = -this.rh;
      this.ri = -this.ri;
      this.rs = -this.rs;
      this.rf = -this.rf;
    }
  },

  year4: {
    regex: RegExp('^' + reYear4),
    name: 'year4',
    callback: function callback(match, year) {
      this.y = +year;
      return true;
    }
  },

  whitespace: {
    regex: /^[ .,\t]+/,
    name: 'whitespace'
    // do nothing
  },

  dateShortWithTimeLong: {
    regex: RegExp('^' + reDateNoYear + 't?' + reHour24 + '[:.]' + reMinute + '[:.]' + reSecond, 'i'),
    name: 'dateshortwithtimelong',
    callback: function callback(match, month, day, hour, minute, second) {
      return this.ymd(this.y, lookupMonth(month), +day) && this.time(+hour, +minute, +second, 0);
    }
  },

  dateShortWithTimeLong12: {
    regex: RegExp('^' + reDateNoYear + reHour12 + '[:.]' + reMinute + '[:.]' + reSecondlz + reSpaceOpt + reMeridian, 'i'),
    name: 'dateshortwithtimelong12',
    callback: function callback(match, month, day, hour, minute, second, meridian) {
      return this.ymd(this.y, lookupMonth(month), +day) && this.time(processMeridian(+hour, meridian), +minute, +second, 0);
    }
  },

  dateShortWithTimeShort: {
    regex: RegExp('^' + reDateNoYear + 't?' + reHour24 + '[:.]' + reMinute, 'i'),
    name: 'dateshortwithtimeshort',
    callback: function callback(match, month, day, hour, minute) {
      return this.ymd(this.y, lookupMonth(month), +day) && this.time(+hour, +minute, 0, 0);
    }
  },

  dateShortWithTimeShort12: {
    regex: RegExp('^' + reDateNoYear + reHour12 + '[:.]' + reMinutelz + reSpaceOpt + reMeridian, 'i'),
    name: 'dateshortwithtimeshort12',
    callback: function callback(match, month, day, hour, minute, meridian) {
      return this.ymd(this.y, lookupMonth(month), +day) && this.time(processMeridian(+hour, meridian), +minute, 0, 0);
    }
  }
};

var resultProto = {
  // date
  y: NaN,
  m: NaN,
  d: NaN,
  // time
  h: NaN,
  i: NaN,
  s: NaN,
  f: NaN,

  // relative shifts
  ry: 0,
  rm: 0,
  rd: 0,
  rh: 0,
  ri: 0,
  rs: 0,
  rf: 0,

  // weekday related shifts
  weekday: NaN,
  weekdayBehavior: 0,

  // first or last day of month
  // 0 none, 1 first, -1 last
  firstOrLastDayOfMonth: 0,

  // timezone correction in minutes
  z: NaN,

  // counters
  dates: 0,
  times: 0,
  zones: 0,

  // helper functions
  ymd: function ymd(y, m, d) {
    if (this.dates > 0) {
      return false;
    }

    this.dates++;
    this.y = y;
    this.m = m;
    this.d = d;
    return true;
  },
  time: function time(h, i, s, f) {
    if (this.times > 0) {
      return false;
    }

    this.times++;
    this.h = h;
    this.i = i;
    this.s = s;
    this.f = f;

    return true;
  },
  resetTime: function resetTime() {
    this.h = 0;
    this.i = 0;
    this.s = 0;
    this.f = 0;
    this.times = 0;

    return true;
  },
  zone: function zone(minutes) {
    if (this.zones <= 1) {
      this.zones++;
      this.z = minutes;
      return true;
    }

    return false;
  },
  toDate: function toDate(relativeTo) {
    if (this.dates && !this.times) {
      this.h = this.i = this.s = this.f = 0;
    }

    // fill holes
    if (isNaN(this.y)) {
      this.y = relativeTo.getFullYear();
    }

    if (isNaN(this.m)) {
      this.m = relativeTo.getMonth();
    }

    if (isNaN(this.d)) {
      this.d = relativeTo.getDate();
    }

    if (isNaN(this.h)) {
      this.h = relativeTo.getHours();
    }

    if (isNaN(this.i)) {
      this.i = relativeTo.getMinutes();
    }

    if (isNaN(this.s)) {
      this.s = relativeTo.getSeconds();
    }

    if (isNaN(this.f)) {
      this.f = relativeTo.getMilliseconds();
    }

    // adjust special early
    switch (this.firstOrLastDayOfMonth) {
      case 1:
        this.d = 1;
        break;
      case -1:
        this.d = 0;
        this.m += 1;
        break;
    }

    if (!isNaN(this.weekday)) {
      var date = new Date(relativeTo.getTime());
      date.setFullYear(this.y, this.m, this.d);
      date.setHours(this.h, this.i, this.s, this.f);

      var dow = date.getDay();

      if (this.weekdayBehavior === 2) {
        // To make "this week" work, where the current day of week is a "sunday"
        if (dow === 0 && this.weekday !== 0) {
          this.weekday = -6;
        }

        // To make "sunday this week" work, where the current day of week is not a "sunday"
        if (this.weekday === 0 && dow !== 0) {
          this.weekday = 7;
        }

        this.d -= dow;
        this.d += this.weekday;
      } else {
        var diff = this.weekday - dow;

        // some PHP magic
        if (this.rd < 0 && diff < 0 || this.rd >= 0 && diff <= -this.weekdayBehavior) {
          diff += 7;
        }

        if (this.weekday >= 0) {
          this.d += diff;
        } else {
          this.d -= 7 - (Math.abs(this.weekday) - dow);
        }

        this.weekday = NaN;
      }
    }

    // adjust relative
    this.y += this.ry;
    this.m += this.rm;
    this.d += this.rd;

    this.h += this.rh;
    this.i += this.ri;
    this.s += this.rs;
    this.f += this.rf;

    this.ry = this.rm = this.rd = 0;
    this.rh = this.ri = this.rs = this.rf = 0;

    var result = new Date(relativeTo.getTime());
    // since Date constructor treats years <= 99 as 1900+
    // it can't be used, thus this weird way
    result.setFullYear(this.y, this.m, this.d);
    result.setHours(this.h, this.i, this.s, this.f);

    // note: this is done twice in PHP
    // early when processing special relatives
    // and late
    // todo: check if the logic can be reduced
    // to just one time action
    switch (this.firstOrLastDayOfMonth) {
      case 1:
        result.setDate(1);
        break;
      case -1:
        result.setMonth(result.getMonth() + 1, 0);
        break;
    }

    // adjust timezone
    if (!isNaN(this.z) && result.getTimezoneOffset() !== this.z) {
      result.setUTCFullYear(result.getFullYear(), result.getMonth(), result.getDate());

      result.setUTCHours(result.getHours(), result.getMinutes() + this.z, result.getSeconds(), result.getMilliseconds());
    }

    return result;
  }
};

module.exports = function strtotime(str, now) {
  //       discuss at: https://locutus.io/php/strtotime/
  //      original by: Caio Ariede (https://caioariede.com)
  //      improved by: Kevin van Zonneveld (https://kvz.io)
  //      improved by: Caio Ariede (https://caioariede.com)
  //      improved by: A. Matías Quezada (https://amatiasq.com)
  //      improved by: preuter
  //      improved by: Brett Zamir (https://brett-zamir.me)
  //      improved by: Mirko Faber
  //         input by: David
  //      bugfixed by: Wagner B. Soares
  //      bugfixed by: Artur Tchernychev
  //      bugfixed by: Stephan Bösch-Plepelits (https://github.com/plepe)
  // reimplemented by: Rafał Kukawski
  //           note 1: Examples all have a fixed timestamp to prevent
  //           note 1: tests to fail because of variable time(zones)
  //        example 1: strtotime('+1 day', 1129633200)
  //        returns 1: 1129719600
  //        example 2: strtotime('+1 week 2 days 4 hours 2 seconds', 1129633200)
  //        returns 2: 1130425202
  //        example 3: strtotime('last month', 1129633200)
  //        returns 3: 1127041200
  //        example 4: strtotime('2009-05-04 08:30:00+00')
  //        returns 4: 1241425800
  //        example 5: strtotime('2009-05-04 08:30:00+02:00')
  //        returns 5: 1241418600

  if (now == null) {
    now = Math.floor(Date.now() / 1000);
  }

  // the rule order is important
  // if multiple rules match, the longest match wins
  // if multiple rules match the same string, the first match wins
  var rules = [formats.yesterday, formats.now, formats.noon, formats.midnightOrToday, formats.tomorrow, formats.timestamp, formats.firstOrLastDay, formats.backOrFrontOf,
  // formats.weekdayOf, // not yet implemented
  formats.timeTiny12, formats.timeShort12, formats.timeLong12, formats.mssqltime, formats.timeShort24, formats.timeLong24, formats.iso8601long, formats.gnuNoColon, formats.iso8601noColon, formats.americanShort, formats.american, formats.iso8601date4, formats.iso8601dateSlash, formats.dateSlash, formats.gnuDateShortOrIso8601date2, formats.gnuDateShorter, formats.dateFull, formats.pointedDate4, formats.pointedDate2, formats.dateNoDay, formats.dateNoDayRev, formats.dateTextual, formats.dateNoYear, formats.dateNoYearRev, formats.dateNoColon, formats.xmlRpc, formats.xmlRpcNoColon, formats.soap, formats.wddx, formats.exif, formats.pgydotd, formats.isoWeekDay, formats.pgTextShort, formats.pgTextReverse, formats.clf, formats.year4, formats.ago, formats.dayText, formats.relativeTextWeek, formats.relativeText, formats.monthFullOrMonthAbbr, formats.tzCorrection, formats.dateShortWithTimeShort12, formats.dateShortWithTimeLong12, formats.dateShortWithTimeShort, formats.dateShortWithTimeLong, formats.relative, formats.whitespace];

  var result = Object.create(resultProto);

  while (str.length) {
    var longestMatch = null;
    var finalRule = null;

    for (var i = 0, l = rules.length; i < l; i++) {
      var format = rules[i];

      var match = str.match(format.regex);

      if (match) {
        if (!longestMatch || match[0].length > longestMatch[0].length) {
          longestMatch = match;
          finalRule = format;
        }
      }
    }

    if (!finalRule || finalRule.callback && finalRule.callback.apply(result, longestMatch) === false) {
      return false;
    }

    str = str.substr(longestMatch[0].length);
    finalRule = null;
    longestMatch = null;
  }

  return Math.floor(result.toDate(new Date(now * 1000)) / 1000);
};


/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function date(format, timestamp) {
  //  discuss at: https://locutus.io/php/date/
  // original by: Carlos R. L. Rodrigues (https://www.jsfromhell.com)
  // original by: gettimeofday
  //    parts by: Peter-Paul Koch (https://www.quirksmode.org/js/beat.html)
  // improved by: Kevin van Zonneveld (https://kvz.io)
  // improved by: MeEtc (https://yass.meetcweb.com)
  // improved by: Brad Touesnard
  // improved by: Tim Wiel
  // improved by: Bryan Elliott
  // improved by: David Randall
  // improved by: Theriault (https://github.com/Theriault)
  // improved by: Theriault (https://github.com/Theriault)
  // improved by: Brett Zamir (https://brett-zamir.me)
  // improved by: Theriault (https://github.com/Theriault)
  // improved by: Thomas Beaucourt (https://www.webapp.fr)
  // improved by: JT
  // improved by: Theriault (https://github.com/Theriault)
  // improved by: Rafał Kukawski (https://blog.kukawski.pl)
  // improved by: Theriault (https://github.com/Theriault)
  //    input by: Brett Zamir (https://brett-zamir.me)
  //    input by: majak
  //    input by: Alex
  //    input by: Martin
  //    input by: Alex Wilson
  //    input by: Haravikk
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: majak
  // bugfixed by: Kevin van Zonneveld (https://kvz.io)
  // bugfixed by: Brett Zamir (https://brett-zamir.me)
  // bugfixed by: omid (https://locutus.io/php/380:380#comment_137122)
  // bugfixed by: Chris (https://www.devotis.nl/)
  //      note 1: Uses global: locutus to store the default timezone
  //      note 1: Although the function potentially allows timezone info
  //      note 1: (see notes), it currently does not set
  //      note 1: per a timezone specified by date_default_timezone_set(). Implementers might use
  //      note 1: $locutus.currentTimezoneOffset and
  //      note 1: $locutus.currentTimezoneDST set by that function
  //      note 1: in order to adjust the dates in this function
  //      note 1: (or our other date functions!) accordingly
  //   example 1: date('H:m:s \\m \\i\\s \\m\\o\\n\\t\\h', 1062402400)
  //   returns 1: '07:09:40 m is month'
  //   example 2: date('F j, Y, g:i a', 1062462400)
  //   returns 2: 'September 2, 2003, 12:26 am'
  //   example 3: date('Y W o', 1062462400)
  //   returns 3: '2003 36 2003'
  //   example 4: var $x = date('Y m d', (new Date()).getTime() / 1000)
  //   example 4: $x = $x + ''
  //   example 4: var $result = $x.length // 2009 01 09
  //   returns 4: 10
  //   example 5: date('W', 1104534000)
  //   returns 5: '52'
  //   example 6: date('B t', 1104534000)
  //   returns 6: '999 31'
  //   example 7: date('W U', 1293750000.82); // 2010-12-31
  //   returns 7: '52 1293750000'
  //   example 8: date('W', 1293836400); // 2011-01-01
  //   returns 8: '52'
  //   example 9: date('W Y-m-d', 1293974054); // 2011-01-02
  //   returns 9: '52 2011-01-02'
  //        test: skip-1 skip-2 skip-5

  var jsdate, f;
  // Keep this here (works, but for code commented-out below for file size reasons)
  // var tal= [];
  var txtWords = ['Sun', 'Mon', 'Tues', 'Wednes', 'Thurs', 'Fri', 'Satur', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // trailing backslash -> (dropped)
  // a backslash followed by any character (including backslash) -> the character
  // empty string -> empty string
  var formatChr = /\\?(.?)/gi;
  var formatChrCb = function formatChrCb(t, s) {
    return f[t] ? f[t]() : s;
  };
  var _pad = function _pad(n, c) {
    n = String(n);
    while (n.length < c) {
      n = '0' + n;
    }
    return n;
  };
  f = {
    // Day
    d: function d() {
      // Day of month w/leading 0; 01..31
      return _pad(f.j(), 2);
    },
    D: function D() {
      // Shorthand day name; Mon...Sun
      return f.l().slice(0, 3);
    },
    j: function j() {
      // Day of month; 1..31
      return jsdate.getDate();
    },
    l: function l() {
      // Full day name; Monday...Sunday
      return txtWords[f.w()] + 'day';
    },
    N: function N() {
      // ISO-8601 day of week; 1[Mon]..7[Sun]
      return f.w() || 7;
    },
    S: function S() {
      // Ordinal suffix for day of month; st, nd, rd, th
      var j = f.j();
      var i = j % 10;
      if (i <= 3 && parseInt(j % 100 / 10, 10) === 1) {
        i = 0;
      }
      return ['st', 'nd', 'rd'][i - 1] || 'th';
    },
    w: function w() {
      // Day of week; 0[Sun]..6[Sat]
      return jsdate.getDay();
    },
    z: function z() {
      // Day of year; 0..365
      var a = new Date(f.Y(), f.n() - 1, f.j());
      var b = new Date(f.Y(), 0, 1);
      return Math.round((a - b) / 864e5);
    },

    // Week
    W: function W() {
      // ISO-8601 week number
      var a = new Date(f.Y(), f.n() - 1, f.j() - f.N() + 3);
      var b = new Date(a.getFullYear(), 0, 4);
      return _pad(1 + Math.round((a - b) / 864e5 / 7), 2);
    },

    // Month
    F: function F() {
      // Full month name; January...December
      return txtWords[6 + f.n()];
    },
    m: function m() {
      // Month w/leading 0; 01...12
      return _pad(f.n(), 2);
    },
    M: function M() {
      // Shorthand month name; Jan...Dec
      return f.F().slice(0, 3);
    },
    n: function n() {
      // Month; 1...12
      return jsdate.getMonth() + 1;
    },
    t: function t() {
      // Days in month; 28...31
      return new Date(f.Y(), f.n(), 0).getDate();
    },

    // Year
    L: function L() {
      // Is leap year?; 0 or 1
      var j = f.Y();
      return j % 4 === 0 & j % 100 !== 0 | j % 400 === 0;
    },
    o: function o() {
      // ISO-8601 year
      var n = f.n();
      var W = f.W();
      var Y = f.Y();
      return Y + (n === 12 && W < 9 ? 1 : n === 1 && W > 9 ? -1 : 0);
    },
    Y: function Y() {
      // Full year; e.g. 1980...2010
      return jsdate.getFullYear();
    },
    y: function y() {
      // Last two digits of year; 00...99
      return f.Y().toString().slice(-2);
    },

    // Time
    a: function a() {
      // am or pm
      return jsdate.getHours() > 11 ? 'pm' : 'am';
    },
    A: function A() {
      // AM or PM
      return f.a().toUpperCase();
    },
    B: function B() {
      // Swatch Internet time; 000..999
      var H = jsdate.getUTCHours() * 36e2;
      // Hours
      var i = jsdate.getUTCMinutes() * 60;
      // Minutes
      // Seconds
      var s = jsdate.getUTCSeconds();
      return _pad(Math.floor((H + i + s + 36e2) / 86.4) % 1e3, 3);
    },
    g: function g() {
      // 12-Hours; 1..12
      return f.G() % 12 || 12;
    },
    G: function G() {
      // 24-Hours; 0..23
      return jsdate.getHours();
    },
    h: function h() {
      // 12-Hours w/leading 0; 01..12
      return _pad(f.g(), 2);
    },
    H: function H() {
      // 24-Hours w/leading 0; 00..23
      return _pad(f.G(), 2);
    },
    i: function i() {
      // Minutes w/leading 0; 00..59
      return _pad(jsdate.getMinutes(), 2);
    },
    s: function s() {
      // Seconds w/leading 0; 00..59
      return _pad(jsdate.getSeconds(), 2);
    },
    u: function u() {
      // Microseconds; 000000-999000
      return _pad(jsdate.getMilliseconds() * 1000, 6);
    },

    // Timezone
    e: function e() {
      // Timezone identifier; e.g. Atlantic/Azores, ...
      // The following works, but requires inclusion of the very large
      // timezone_abbreviations_list() function.
      /*              return that.date_default_timezone_get();
       */
      var msg = 'Not supported (see source code of date() for timezone on how to add support)';
      throw new Error(msg);
    },
    I: function I() {
      // DST observed?; 0 or 1
      // Compares Jan 1 minus Jan 1 UTC to Jul 1 minus Jul 1 UTC.
      // If they are not equal, then DST is observed.
      var a = new Date(f.Y(), 0);
      // Jan 1
      var c = Date.UTC(f.Y(), 0);
      // Jan 1 UTC
      var b = new Date(f.Y(), 6);
      // Jul 1
      // Jul 1 UTC
      var d = Date.UTC(f.Y(), 6);
      return a - c !== b - d ? 1 : 0;
    },
    O: function O() {
      // Difference to GMT in hour format; e.g. +0200
      var tzo = jsdate.getTimezoneOffset();
      var a = Math.abs(tzo);
      return (tzo > 0 ? '-' : '+') + _pad(Math.floor(a / 60) * 100 + a % 60, 4);
    },
    P: function P() {
      // Difference to GMT w/colon; e.g. +02:00
      var O = f.O();
      return O.substr(0, 3) + ':' + O.substr(3, 2);
    },
    T: function T() {
      // The following works, but requires inclusion of the very
      // large timezone_abbreviations_list() function.
      /*              var abbr, i, os, _default;
      if (!tal.length) {
        tal = that.timezone_abbreviations_list();
      }
      if ($locutus && $locutus.default_timezone) {
        _default = $locutus.default_timezone;
        for (abbr in tal) {
          for (i = 0; i < tal[abbr].length; i++) {
            if (tal[abbr][i].timezone_id === _default) {
              return abbr.toUpperCase();
            }
          }
        }
      }
      for (abbr in tal) {
        for (i = 0; i < tal[abbr].length; i++) {
          os = -jsdate.getTimezoneOffset() * 60;
          if (tal[abbr][i].offset === os) {
            return abbr.toUpperCase();
          }
        }
      }
      */
      return 'UTC';
    },
    Z: function Z() {
      // Timezone offset in seconds (-43200...50400)
      return -jsdate.getTimezoneOffset() * 60;
    },

    // Full Date/Time
    c: function c() {
      // ISO-8601 date.
      return 'Y-m-d\\TH:i:sP'.replace(formatChr, formatChrCb);
    },
    r: function r() {
      // RFC 2822
      return 'D, d M Y H:i:s O'.replace(formatChr, formatChrCb);
    },
    U: function U() {
      // Seconds since UNIX epoch
      return jsdate / 1000 | 0;
    }
  };

  var _date = function _date(format, timestamp) {
    jsdate = timestamp === undefined ? new Date() // Not provided
    : timestamp instanceof Date ? new Date(timestamp) // JS Date()
    : new Date(timestamp * 1000) // UNIX timestamp (auto-convert to int)
    ;
    return format.replace(formatChr, formatChrCb);
  };

  return _date(format, timestamp);
};


/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function boolval(mixedVar) {
  // original by: Will Rowe
  //   example 1: boolval(true)
  //   returns 1: true
  //   example 2: boolval(false)
  //   returns 2: false
  //   example 3: boolval(0)
  //   returns 3: false
  //   example 4: boolval(0.0)
  //   returns 4: false
  //   example 5: boolval('')
  //   returns 5: false
  //   example 6: boolval('0')
  //   returns 6: false
  //   example 7: boolval([])
  //   returns 7: false
  //   example 8: boolval('')
  //   returns 8: false
  //   example 9: boolval(null)
  //   returns 9: false
  //   example 10: boolval(undefined)
  //   returns 10: false
  //   example 11: boolval('true')
  //   returns 11: true

  if (mixedVar === false) {
    return false;
  }

  if (mixedVar === 0 || mixedVar === 0.0) {
    return false;
  }

  if (mixedVar === '' || mixedVar === '0') {
    return false;
  }

  if (Array.isArray(mixedVar) && mixedVar.length === 0) {
    return false;
  }

  if (mixedVar === null || mixedVar === undefined) {
    return false;
  }

  return true;
};


/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (Twig) {
  'use strict';

  Twig.Templates.registerLoader('ajax', function (location, params, callback, errorCallback) {
    var template;
    var precompiled = params.precompiled;
    var parser = this.parsers[params.parser] || this.parser.twig;

    if (typeof XMLHttpRequest === 'undefined') {
      throw new Twig.Error('Unsupported platform: Unable to do ajax requests ' + 'because there is no "XMLHTTPRequest" implementation');
    }

    var xmlhttp = new XMLHttpRequest();

    xmlhttp.onreadystatechange = function () {
      var data = null;

      if (xmlhttp.readyState === 4) {
        if (xmlhttp.status === 200 || window.cordova && xmlhttp.status === 0) {
          Twig.log.debug('Got template ', xmlhttp.responseText);

          if (precompiled === true) {
            data = JSON.parse(xmlhttp.responseText);
          } else {
            data = xmlhttp.responseText;
          }

          params.url = location;
          params.data = data;
          template = parser.call(this, params);

          if (typeof callback === 'function') {
            callback(template);
          }
        } else if (typeof errorCallback === 'function') {
          errorCallback(xmlhttp);
        }
      }
    };

    xmlhttp.open('GET', location, Boolean(params.async));
    xmlhttp.overrideMimeType('text/plain');
    xmlhttp.send();

    if (params.async) {
      // TODO: return deferred promise
      return true;
    }

    return template;
  });
};

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (Twig) {
  'use strict';

  var fs;
  var path;

  try {
    // Require lib dependencies at runtime
    fs = __webpack_require__(33);
    path = __webpack_require__(6);
  } catch (error) {
    // NOTE: this is in a try/catch to avoid errors cross platform
    console.warn('Missing fs and path modules. ' + error);
  }

  Twig.Templates.registerLoader('fs', function (location, params, callback, errorCallback) {
    var template;
    var data = null;
    var precompiled = params.precompiled;
    var parser = this.parsers[params.parser] || this.parser.twig;

    if (!fs || !path) {
      throw new Twig.Error('Unsupported platform: Unable to load from file ' + 'because there is no "fs" or "path" implementation');
    }

    var loadTemplateFn = function loadTemplateFn(err, data) {
      if (err) {
        if (typeof errorCallback === 'function') {
          errorCallback(err);
        }

        return;
      }

      if (precompiled === true) {
        data = JSON.parse(data);
      }

      params.data = data;
      params.path = params.path || location; // Template is in data

      template = parser.call(this, params);

      if (typeof callback === 'function') {
        callback(template);
      }
    };

    params.path = params.path || location;

    if (params.async) {
      fs.stat(params.path, function (err, stats) {
        if (err || !stats.isFile()) {
          if (typeof errorCallback === 'function') {
            errorCallback(new Twig.Error('Unable to find template file ' + params.path));
          }

          return;
        }

        fs.readFile(params.path, 'utf8', loadTemplateFn);
      }); // TODO: return deferred promise

      return true;
    }

    try {
      if (!fs.statSync(params.path).isFile()) {
        throw new Twig.Error('Unable to find template file ' + params.path);
      }
    } catch (error) {
      throw new Twig.Error('Unable to find template file ' + params.path + '. ' + error);
    }

    data = fs.readFileSync(params.path, 'utf8');
    loadTemplateFn(undefined, data);
    return template;
  });
};

/***/ }),
/* 33 */
/***/ (function(module, exports) {

module.exports = require("fs");

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _defineProperty2 = _interopRequireDefault(__webpack_require__(2));

function _createForOfIteratorHelper(o, allowArrayLike) { var it; if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { (0, _defineProperty2["default"])(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

// ## twig.logic.js
//
// This file handles tokenizing, compiling and parsing logic tokens. {% ... %}
module.exports = function (Twig) {
  'use strict';
  /**
   * Namespace for logic handling.
   */

  Twig.logic = {};
  /**
   * Logic token types.
   */

  Twig.logic.type = {
    if_: 'Twig.logic.type.if',
    endif: 'Twig.logic.type.endif',
    for_: 'Twig.logic.type.for',
    endfor: 'Twig.logic.type.endfor',
    else_: 'Twig.logic.type.else',
    elseif: 'Twig.logic.type.elseif',
    set: 'Twig.logic.type.set',
    setcapture: 'Twig.logic.type.setcapture',
    endset: 'Twig.logic.type.endset',
    filter: 'Twig.logic.type.filter',
    endfilter: 'Twig.logic.type.endfilter',
    apply: 'Twig.logic.type.apply',
    endapply: 'Twig.logic.type.endapply',
    "do": 'Twig.logic.type.do',
    shortblock: 'Twig.logic.type.shortblock',
    block: 'Twig.logic.type.block',
    endblock: 'Twig.logic.type.endblock',
    extends_: 'Twig.logic.type.extends',
    use: 'Twig.logic.type.use',
    include: 'Twig.logic.type.include',
    spaceless: 'Twig.logic.type.spaceless',
    endspaceless: 'Twig.logic.type.endspaceless',
    macro: 'Twig.logic.type.macro',
    endmacro: 'Twig.logic.type.endmacro',
    import_: 'Twig.logic.type.import',
    from: 'Twig.logic.type.from',
    embed: 'Twig.logic.type.embed',
    endembed: 'Twig.logic.type.endembed',
    "with": 'Twig.logic.type.with',
    endwith: 'Twig.logic.type.endwith',
    deprecated: 'Twig.logic.type.deprecated'
  }; // Regular expressions for handling logic tokens.
  //
  // Properties:
  //
  //      type:  The type of expression this matches
  //
  //      regex: A regular expression that matches the format of the token
  //
  //      next:  What logic tokens (if any) pop this token off the logic stack. If empty, the
  //             logic token is assumed to not require an end tag and isn't push onto the stack.
  //
  //      open:  Does this tag open a logic expression or is it standalone. For example,
  //             {% endif %} cannot exist without an opening {% if ... %} tag, so open = false.
  //
  //  Functions:
  //
  //      compile: A function that handles compiling the token into an output token ready for
  //               parsing with the parse function.
  //
  //      parse:   A function that parses the compiled token into output (HTML / whatever the
  //               template represents).

  Twig.logic.definitions = [{
    /**
     * If type logic tokens.
     *
     *  Format: {% if expression %}
     */
    type: Twig.logic.type.if_,
    regex: /^if\s?([\s\S]+)$/,
    next: [Twig.logic.type.else_, Twig.logic.type.elseif, Twig.logic.type.endif],
    open: true,
    compile: function compile(token) {
      var expression = token.match[1]; // Compile the expression.

      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return Twig.expression.parseAsync.call(state, token.stack, context).then(function (result) {
        chain = true;

        if (Twig.lib.boolval(result)) {
          chain = false;
          return state.parseAsync(token.output, context);
        }

        return '';
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * Else if type logic tokens.
     *
     *  Format: {% elseif expression %}
     */
    type: Twig.logic.type.elseif,
    regex: /^elseif\s?([^\s].*)$/,
    next: [Twig.logic.type.else_, Twig.logic.type.elseif, Twig.logic.type.endif],
    open: false,
    compile: function compile(token) {
      var expression = token.match[1]; // Compile the expression.

      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return Twig.expression.parseAsync.call(state, token.stack, context).then(function (result) {
        if (chain && Twig.lib.boolval(result)) {
          chain = false;
          return state.parseAsync(token.output, context);
        }

        return '';
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * Else type logic tokens.
     *
     *  Format: {% else %}
     */
    type: Twig.logic.type.else_,
    regex: /^else$/,
    next: [Twig.logic.type.endif, Twig.logic.type.endfor],
    open: false,
    parse: function parse(token, context, chain) {
      var promise = Twig.Promise.resolve('');
      var state = this;

      if (chain) {
        promise = state.parseAsync(token.output, context);
      }

      return promise.then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * End if type logic tokens.
     *
     *  Format: {% endif %}
     */
    type: Twig.logic.type.endif,
    regex: /^endif$/,
    next: [],
    open: false
  }, {
    /**
     * For type logic tokens.
     *
     *  Format: {% for expression %}
     */
    type: Twig.logic.type.for_,
    regex: /^for\s+([a-zA-Z0-9_,\s]+)\s+in\s+([\S\s]+?)(?:\s+if\s+([^\s].*))?$/,
    next: [Twig.logic.type.else_, Twig.logic.type.endfor],
    open: true,
    compile: function compile(token) {
      var keyValue = token.match[1];
      var expression = token.match[2];
      var conditional = token.match[3];
      var kvSplit = null;
      token.keyVar = null;
      token.valueVar = null;

      if (keyValue.includes(',')) {
        kvSplit = keyValue.split(',');

        if (kvSplit.length === 2) {
          token.keyVar = kvSplit[0].trim();
          token.valueVar = kvSplit[1].trim();
        } else {
          throw new Twig.Error('Invalid expression in for loop: ' + keyValue);
        }
      } else {
        token.valueVar = keyValue.trim();
      } // Valid expressions for a for loop
      //   for item     in expression
      //   for key,item in expression
      // Compile the expression.


      token.expression = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack; // Compile the conditional (if available)

      if (conditional) {
        token.conditional = Twig.expression.compile.call(this, {
          type: Twig.expression.type.expression,
          value: conditional
        }).stack;
      }

      delete token.match;
      return token;
    },
    parse: function parse(token, context, continueChain) {
      // Parse expression
      var output = [];
      var len;
      var index = 0;
      var keyset;
      var state = this;
      var conditional = token.conditional;

      var buildLoop = function buildLoop(index, len) {
        var isConditional = conditional !== undefined;
        return {
          index: index + 1,
          index0: index,
          revindex: isConditional ? undefined : len - index,
          revindex0: isConditional ? undefined : len - index - 1,
          first: index === 0,
          last: isConditional ? undefined : index === len - 1,
          length: isConditional ? undefined : len,
          parent: context
        };
      }; // Run once for each iteration of the loop


      var loop = function loop(key, value) {
        var innerContext = _objectSpread({}, context);

        innerContext[token.valueVar] = value;

        if (token.keyVar) {
          innerContext[token.keyVar] = key;
        } // Loop object


        innerContext.loop = buildLoop(index, len);
        var promise = conditional === undefined ? Twig.Promise.resolve(true) : Twig.expression.parseAsync.call(state, conditional, innerContext);
        return promise.then(function (condition) {
          if (!condition) {
            return;
          }

          return state.parseAsync(token.output, innerContext).then(function (tokenOutput) {
            output.push(tokenOutput);
            index += 1;
          });
        }).then(function () {
          // Delete loop-related variables from the context
          delete innerContext.loop;
          delete innerContext[token.valueVar];
          delete innerContext[token.keyVar]; // Merge in values that exist in context but have changed
          // in inner_context.

          Twig.merge(context, innerContext, true);
        });
      };

      return Twig.expression.parseAsync.call(state, token.expression, context).then(function (result) {
        if (Array.isArray(result)) {
          len = result.length;
          return Twig.async.forEach(result, function (value) {
            var key = index;
            return loop(key, value);
          });
        }

        if (Twig.lib.is('Object', result)) {
          if (result._keys === undefined) {
            keyset = Object.keys(result);
          } else {
            keyset = result._keys;
          }

          len = keyset.length;
          return Twig.async.forEach(keyset, function (key) {
            // Ignore the _keys property, it's internal to twig.js
            if (key === '_keys') {
              return;
            }

            return loop(key, result[key]);
          });
        }
      }).then(function () {
        // Only allow else statements if no output was generated
        continueChain = output.length === 0;
        return {
          chain: continueChain,
          context: context,
          output: Twig.output.call(state.template, output)
        };
      });
    }
  }, {
    /**
     * End for type logic tokens.
     *
     *  Format: {% endfor %}
     */
    type: Twig.logic.type.endfor,
    regex: /^endfor$/,
    next: [],
    open: false
  }, {
    /**
     * Set type logic tokens.
     *
     *  Format: {% set key = expression %}
     */
    type: Twig.logic.type.set,
    regex: /^set\s+([a-zA-Z0-9_,\s]+)\s*=\s*([\s\S]+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      //
      var key = token.match[1].trim();
      var expression = token.match[2]; // Compile the expression.

      var expressionStack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      token.key = key;
      token.expression = expressionStack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, continueChain) {
      var key = token.key;
      var state = this;
      return Twig.expression.parseAsync.call(state, token.expression, context).then(function (value) {
        if (value === context) {
          /*  If storing the context in a variable, it needs to be a clone of the current state of context.
              Otherwise we have a context with infinite recursion.
              Fixes #341
          */
          value = _objectSpread({}, value);
        }

        context[key] = value;
        return {
          chain: continueChain,
          context: context
        };
      });
    }
  }, {
    /**
     * Set capture type logic tokens.
     *
     *  Format: {% set key %}
     */
    type: Twig.logic.type.setcapture,
    regex: /^set\s+([a-zA-Z0-9_,\s]+)$/,
    next: [Twig.logic.type.endset],
    open: true,
    compile: function compile(token) {
      var key = token.match[1].trim();
      token.key = key;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, continueChain) {
      var state = this;
      var key = token.key;
      return state.parseAsync(token.output, context).then(function (output) {
        // Set on both the global and local context
        state.context[key] = output;
        context[key] = output;
        return {
          chain: continueChain,
          context: context
        };
      });
    }
  }, {
    /**
     * End set type block logic tokens.
     *
     *  Format: {% endset %}
     */
    type: Twig.logic.type.endset,
    regex: /^endset$/,
    next: [],
    open: false
  }, {
    /**
     * Filter logic tokens.
     *
     *  Format: {% filter upper %} or {% filter lower|escape %}
     */
    type: Twig.logic.type.filter,
    regex: /^filter\s+(.+)$/,
    next: [Twig.logic.type.endfilter],
    open: true,
    compile: function compile(token) {
      var expression = '|' + token.match[1].trim(); // Compile the expression.

      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return state.parseAsync(token.output, context).then(function (output) {
        var stack = [{
          type: Twig.expression.type.string,
          value: output
        }].concat(token.stack);
        return Twig.expression.parseAsync.call(state, stack, context);
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * End filter logic tokens.
     *
     *  Format: {% endfilter %}
     */
    type: Twig.logic.type.endfilter,
    regex: /^endfilter$/,
    next: [],
    open: false
  }, {
    /**
     * Apply logic tokens.
     *
     *  Format: {% apply upper %} or {% apply lower|escape %}
     */
    type: Twig.logic.type.apply,
    regex: /^apply\s+(.+)$/,
    next: [Twig.logic.type.endapply],
    open: true,
    compile: function compile(token) {
      var expression = '|' + token.match[1].trim(); // Compile the expression.

      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return state.parseAsync(token.output, context).then(function (output) {
        var stack = [{
          type: Twig.expression.type.string,
          value: output
        }].concat(token.stack);
        return Twig.expression.parseAsync.call(state, stack, context);
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * End apply logic tokens.
     *
     *  Format: {% endapply %}
     */
    type: Twig.logic.type.endapply,
    regex: /^endapply$/,
    next: [],
    open: false
  }, {
    /**
     * Set type logic tokens.
     *
     *  Format: {% do expression %}
     */
    type: Twig.logic.type["do"],
    regex: /^do\s+([\S\s]+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      //
      var expression = token.match[1]; // Compile the expression.

      var expressionStack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      token.expression = expressionStack;
      delete token.match;
      return token;
    },
    parse: function parse(token, context, continueChain) {
      var state = this;
      return Twig.expression.parseAsync.call(state, token.expression, context).then(function () {
        return {
          chain: continueChain,
          context: context
        };
      });
    }
  }, {
    /**
     * Block logic tokens.
     *
     *  Format: {% block title %}
     */
    type: Twig.logic.type.block,
    regex: /^block\s+(\w+)$/,
    next: [Twig.logic.type.endblock],
    open: true,
    compile: function compile(token) {
      token.blockName = token.match[1].trim();
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      var promise = Twig.Promise.resolve();
      state.template.blocks.defined[token.blockName] = new Twig.Block(state.template, token);

      if (state.template.parentTemplate === null || state.template.parentTemplate instanceof Twig.Template) {
        promise = state.getBlock(token.blockName).render(state, context);
      }

      return promise.then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    /**
     * Block shorthand logic tokens.
     *
     *  Format: {% block title expression %}
     */
    type: Twig.logic.type.shortblock,
    regex: /^block\s+(\w+)\s+(.+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var template = this;
      token.expression = token.match[2].trim();
      token.output = Twig.expression.compile({
        type: Twig.expression.type.expression,
        value: token.expression
      }).stack;
      return Twig.logic.handler[Twig.logic.type.block].compile.apply(template, [token]);
    },
    parse: function parse() {
      var state = this;

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      return Twig.logic.handler[Twig.logic.type.block].parse.apply(state, args);
    }
  }, {
    /**
     * End block logic tokens.
     *
     *  Format: {% endblock %}
     */
    type: Twig.logic.type.endblock,
    regex: /^endblock(?:\s+(\w+))?$/,
    next: [],
    open: false
  }, {
    /**
     * Block logic tokens.
     *
     *  Format: {% extends "template.twig" %}
     */
    type: Twig.logic.type.extends_,
    regex: /^extends\s+(.+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var expression = token.match[1].trim();
      delete token.match;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return Twig.expression.parseAsync.call(state, token.stack, context).then(function (fileName) {
        if (Array.isArray(fileName)) {
          var result = fileName.reverse().reduce(function (acc, file) {
            try {
              return {
                render: state.template.importFile(file),
                fileName: file
              };
              /* eslint-disable-next-line no-unused-vars */
            } catch (error) {
              return acc;
            }
          }, {
            render: null,
            fileName: null
          });

          if (result.fileName !== null) {
            state.template.parentTemplate = result.fileName;
          }
        } else {
          state.template.parentTemplate = fileName;
        }

        return {
          chain: chain,
          output: ''
        };
      });
    }
  }, {
    /**
     * Block logic tokens.
     *
     *  Format: {% use "template.twig" %}
     */
    type: Twig.logic.type.use,
    regex: /^use\s+(.+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var expression = token.match[1].trim();
      delete token.match;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      return Twig.expression.parseAsync.call(state, token.stack, context).then(function (filePath) {
        // Create a new state instead of using the current state
        // any defined blocks will be created in isolation
        var useTemplate = state.template.importFile(filePath);
        var useState = new Twig.ParseState(useTemplate);
        return useState.parseAsync(useTemplate.tokens).then(function () {
          state.template.blocks.imported = _objectSpread(_objectSpread({}, state.template.blocks.imported), useState.getBlocks());
        });
      }).then(function () {
        return {
          chain: chain,
          output: ''
        };
      });
    }
  }, {
    /**
     * Block logic tokens.
     *
     *  Format: {% includes "template.twig" [with {some: 'values'} only] %}
     */
    type: Twig.logic.type.include,
    regex: /^include\s+(.+?)(?:\s|$)(ignore missing(?:\s|$))?(?:with\s+([\S\s]+?))?(?:\s|$)(only)?$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var match = token.match;
      var expression = match[1].trim();
      var ignoreMissing = match[2] !== undefined;
      var withContext = match[3];
      var only = match[4] !== undefined && match[4].length;
      delete token.match;
      token.only = only;
      token.ignoreMissing = ignoreMissing;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;

      if (withContext !== undefined) {
        token.withStack = Twig.expression.compile.call(this, {
          type: Twig.expression.type.expression,
          value: withContext.trim()
        }).stack;
      }

      return token;
    },
    parse: function parse(token, context, chain) {
      // Resolve filename
      var innerContext = token.only ? {} : _objectSpread({}, context);
      var ignoreMissing = token.ignoreMissing;
      var state = this;
      var promise = null;
      var result = {
        chain: chain,
        output: ''
      };

      if (typeof token.withStack === 'undefined') {
        promise = Twig.Promise.resolve();
      } else {
        promise = Twig.expression.parseAsync.call(state, token.withStack, context).then(function (withContext) {
          innerContext = _objectSpread(_objectSpread({}, innerContext), withContext);
        });
      }

      return promise.then(function () {
        return Twig.expression.parseAsync.call(state, token.stack, context);
      }).then(function (file) {
        var files;

        if (Array.isArray(file)) {
          files = file;
        } else {
          files = [file];
        }

        var result = files.reduce(function (acc, file) {
          if (acc.render === null) {
            if (file instanceof Twig.Template) {
              return {
                render: file.renderAsync(innerContext, {
                  isInclude: true
                }),
                lastError: null
              };
            }

            try {
              return {
                render: state.template.importFile(file).renderAsync(innerContext, {
                  isInclude: true
                }),
                lastError: null
              };
            } catch (error) {
              return {
                render: null,
                lastError: error
              };
            }
          }

          return acc;
        }, {
          render: null,
          lastError: null
        });

        if (result.render !== null) {
          return result.render;
        }

        if (result.render === null && ignoreMissing) {
          return '';
        }

        throw result.lastError;
      }).then(function (output) {
        if (output !== '') {
          result.output = output;
        }

        return result;
      });
    }
  }, {
    type: Twig.logic.type.spaceless,
    regex: /^spaceless$/,
    next: [Twig.logic.type.endspaceless],
    open: true,
    // Parse the html and return it without any spaces between tags
    parse: function parse(token, context, chain) {
      var state = this; // Parse the output without any filter

      return state.parseAsync(token.output, context).then(function (tokenOutput) {
        var // A regular expression to find closing and opening tags with spaces between them
        rBetweenTagSpaces = />\s+</g; // Replace all space between closing and opening html tags

        var output = tokenOutput.replace(rBetweenTagSpaces, '><').trim(); // Rewrap output as a Twig.Markup

        output = new Twig.Markup(output);
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, // Add the {% endspaceless %} token
  {
    type: Twig.logic.type.endspaceless,
    regex: /^endspaceless$/,
    next: [],
    open: false
  }, {
    /**
     * Macro logic tokens.
     *
     * Format: {% macro input(name = default, value, type, size) %}
     *
     */
    type: Twig.logic.type.macro,
    regex: /^macro\s+(\w+)\s*\(\s*((?:\w+(?:\s*=\s*([\s\S]+))?(?:,\s*)?)*)\s*\)$/,
    next: [Twig.logic.type.endmacro],
    open: true,
    compile: function compile(token) {
      var macroName = token.match[1];
      var rawParameters = token.match[2].split(/\s*,\s*/);
      var parameters = rawParameters.map(function (rawParameter) {
        return rawParameter.split(/\s*=\s*/)[0];
      });
      var parametersCount = parameters.length; // Duplicate check

      if (parametersCount > 1) {
        var uniq = {};

        for (var i = 0; i < parametersCount; i++) {
          var parameter = parameters[i];

          if (uniq[parameter]) {
            throw new Twig.Error('Duplicate arguments for parameter: ' + parameter);
          } else {
            uniq[parameter] = 1;
          }
        }
      }

      token.macroName = macroName;
      token.parameters = parameters;
      token.defaults = rawParameters.reduce(function (defaults, rawParameter) {
        var pair = rawParameter.split(/\s*=\s*/);
        var key = pair[0];
        var expression = pair[1];

        if (expression) {
          defaults[key] = Twig.expression.compile.call(this, {
            type: Twig.expression.type.expression,
            value: expression
          }).stack;
        } else {
          defaults[key] = undefined;
        }

        return defaults;
      }, {});
      delete token.match;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;

      state.macros[token.macroName] = function () {
        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }

        // Pass global context and other macros
        var macroContext = _objectSpread(_objectSpread({}, context), {}, {
          _self: state.macros
        }); // Save arguments


        return Twig.async.forEach(token.parameters, function (prop, i) {
          // Add parameters from context to macroContext
          if (typeof args[i] !== 'undefined') {
            macroContext[prop] = args[i];
            return true;
          }

          if (typeof token.defaults[prop] !== 'undefined') {
            return Twig.expression.parseAsync.call(this, token.defaults[prop], context).then(function (value) {
              macroContext[prop] = value;
              return Twig.Promise.resolve();
            });
          }

          macroContext[prop] = undefined;
          return true;
        }).then(function () {
          // Render
          return state.parseAsync(token.output, macroContext);
        });
      };

      return {
        chain: chain,
        output: ''
      };
    }
  }, {
    /**
     * End macro logic tokens.
     *
     * Format: {% endmacro %}
     */
    type: Twig.logic.type.endmacro,
    regex: /^endmacro$/,
    next: [],
    open: false
  }, {
    /*
    * Import logic tokens.
    *
    * Format: {% import "template.twig" as form %}
    */
    type: Twig.logic.type.import_,
    regex: /^import\s+(.+)\s+as\s+(\w+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var expression = token.match[1].trim();
      var contextName = token.match[2].trim();
      delete token.match;
      token.expression = expression;
      token.contextName = contextName;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      var output = {
        chain: chain,
        output: ''
      };

      if (token.expression === '_self') {
        context[token.contextName] = state.macros;
        return output;
      }

      return Twig.expression.parseAsync.call(state, token.stack, context).then(function (filePath) {
        return state.template.importFile(filePath || token.expression);
      }).then(function (importTemplate) {
        var importState = new Twig.ParseState(importTemplate);
        return importState.parseAsync(importTemplate.tokens).then(function () {
          context[token.contextName] = importState.macros;
          return output;
        });
      });
    }
  }, {
    /*
    * From logic tokens.
    *
    * Format: {% from "template.twig" import func as form %}
    */
    type: Twig.logic.type.from,
    regex: /^from\s+(.+)\s+import\s+([a-zA-Z0-9_, ]+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      var expression = token.match[1].trim();
      var macroExpressions = token.match[2].trim().split(/\s*,\s*/);
      var macroNames = {};

      var _iterator = _createForOfIteratorHelper(macroExpressions),
          _step;

      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var res = _step.value;
          // Match function as variable
          var macroMatch = res.match(/^(\w+)\s+as\s+(\w+)$/);

          if (macroMatch) {
            macroNames[macroMatch[1].trim()] = macroMatch[2].trim();
          } else if (res.match(/^(\w+)$/)) {
            macroNames[res] = res;
          } else {// ignore import
          }
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }

      delete token.match;
      token.expression = expression;
      token.macroNames = macroNames;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;
      return token;
    },
    parse: function parse(token, context, chain) {
      var state = this;
      var promise;

      if (token.expression === '_self') {
        promise = Twig.Promise.resolve(state.macros);
      } else {
        promise = Twig.expression.parseAsync.call(state, token.stack, context).then(function (filePath) {
          return state.template.importFile(filePath || token.expression);
        }).then(function (importTemplate) {
          var importState = new Twig.ParseState(importTemplate);
          return importState.parseAsync(importTemplate.tokens).then(function () {
            return importState.macros;
          });
        });
      }

      return promise.then(function (macros) {
        for (var macroName in token.macroNames) {
          if (macros[macroName] !== undefined) {
            context[token.macroNames[macroName]] = macros[macroName];
          }
        }

        return {
          chain: chain,
          output: ''
        };
      });
    }
  }, {
    /**
     * The embed tag combines the behaviour of include and extends.
     * It allows you to include another template's contents, just like include does.
     *
     *  Format: {% embed "template.twig" [with {some: 'values'} only] %}
     */
    type: Twig.logic.type.embed,
    regex: /^embed\s+(.+?)(?:\s+(ignore missing))?(?:\s+with\s+([\S\s]+?))?(?:\s+(only))?$/,
    next: [Twig.logic.type.endembed],
    open: true,
    compile: function compile(token) {
      var match = token.match;
      var expression = match[1].trim();
      var ignoreMissing = match[2] !== undefined;
      var withContext = match[3];
      var only = match[4] !== undefined && match[4].length;
      delete token.match;
      token.only = only;
      token.ignoreMissing = ignoreMissing;
      token.stack = Twig.expression.compile.call(this, {
        type: Twig.expression.type.expression,
        value: expression
      }).stack;

      if (withContext !== undefined) {
        token.withStack = Twig.expression.compile.call(this, {
          type: Twig.expression.type.expression,
          value: withContext.trim()
        }).stack;
      }

      return token;
    },
    parse: function parse(token, context, chain) {
      var embedContext = {};
      var promise = Twig.Promise.resolve();
      var state = this;

      if (!token.only) {
        embedContext = _objectSpread({}, context);
      }

      if (token.withStack !== undefined) {
        promise = Twig.expression.parseAsync.call(state, token.withStack, context).then(function (withContext) {
          embedContext = _objectSpread(_objectSpread({}, embedContext), withContext);
        });
      }

      return promise.then(function () {
        return Twig.expression.parseAsync.call(state, token.stack, embedContext);
      }).then(function (fileName) {
        var embedOverrideTemplate = new Twig.Template({
          data: token.output,
          id: state.template.id,
          base: state.template.base,
          path: state.template.path,
          url: state.template.url,
          name: state.template.name,
          method: state.template.method,
          options: state.template.options
        });

        try {
          embedOverrideTemplate.importFile(fileName);
        } catch (error) {
          if (token.ignoreMissing) {
            return '';
          } // Errors preserve references to variables in scope,
          // this removes `this` from the scope.


          state = null;
          throw error;
        }

        embedOverrideTemplate.parentTemplate = fileName;
        return embedOverrideTemplate.renderAsync(embedContext, {
          isInclude: true
        });
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  },
  /* Add the {% endembed %} token
   *
   */
  {
    type: Twig.logic.type.endembed,
    regex: /^endembed$/,
    next: [],
    open: false
  }, {
    /**
     * Block logic tokens.
     *
     *  Format: {% with {some: 'values'} [only] %}
     */
    type: Twig.logic.type["with"],
    regex: /^(?:with\s+([\S\s]+?))(?:\s|$)(only)?$/,
    next: [Twig.logic.type.endwith],
    open: true,
    compile: function compile(token) {
      var match = token.match;
      var withContext = match[1];
      var only = match[2] !== undefined && match[2].length;
      delete token.match;
      token.only = only;

      if (withContext !== undefined) {
        token.withStack = Twig.expression.compile.call(this, {
          type: Twig.expression.type.expression,
          value: withContext.trim()
        }).stack;
      }

      return token;
    },
    parse: function parse(token, context, chain) {
      // Resolve filename
      var innerContext = {};
      var i;
      var state = this;
      var promise = Twig.Promise.resolve();

      if (!token.only) {
        innerContext = _objectSpread({}, context);
      }

      if (token.withStack !== undefined) {
        promise = Twig.expression.parseAsync.call(state, token.withStack, context).then(function (withContext) {
          for (i in withContext) {
            if (Object.hasOwnProperty.call(withContext, i)) {
              innerContext[i] = withContext[i];
            }
          }
        });
      }

      return promise.then(function () {
        return state.parseAsync(token.output, innerContext);
      }).then(function (output) {
        return {
          chain: chain,
          output: output
        };
      });
    }
  }, {
    type: Twig.logic.type.endwith,
    regex: /^endwith$/,
    next: [],
    open: false
  }, {
    /**
     * Deprecated type logic tokens.
     *
     *  Format: {% deprecated 'Description' %}
     */
    type: Twig.logic.type.deprecated,
    regex: /^deprecated\s+(.+)$/,
    next: [],
    open: true,
    compile: function compile(token) {
      console.warn('Deprecation notice: ' + token.match[1]);
      return token;
    },
    parse: function parse() {
      return {};
    }
  }];
  /**
   * Registry for logic handlers.
   */

  Twig.logic.handler = {};
  /**
   * Define a new token type, available at Twig.logic.type.{type}
   */

  Twig.logic.extendType = function (type, value) {
    value = value || 'Twig.logic.type' + type;
    Twig.logic.type[type] = value;
  };
  /**
   * Extend the logic parsing functionality with a new token definition.
   *
   * // Define a new tag
   * Twig.logic.extend({
   *     type: Twig.logic.type.{type},
   *     // The pattern to match for this token
   *     regex: ...,
   *     // What token types can follow this token, leave blank if any.
   *     next: [ ... ]
   *     // Create and return compiled version of the token
   *     compile: function(token) { ... }
   *     // Parse the compiled token with the context provided by the render call
   *     //   and whether this token chain is complete.
   *     parse: function(token, context, chain) { ... }
   * });
   *
   * @param {Object} definition The new logic expression.
   */


  Twig.logic.extend = function (definition) {
    if (definition.type) {
      Twig.logic.extendType(definition.type);
    } else {
      throw new Twig.Error('Unable to extend logic definition. No type provided for ' + definition);
    }

    Twig.logic.handler[definition.type] = definition;
  }; // Extend with built-in expressions


  while (Twig.logic.definitions.length > 0) {
    Twig.logic.extend(Twig.logic.definitions.shift());
  }
  /**
   * Compile a logic token into an object ready for parsing.
   *
   * @param {Object} rawToken An uncompiled logic token.
   *
   * @return {Object} A compiled logic token, ready for parsing.
   */


  Twig.logic.compile = function (rawToken) {
    var expression = rawToken.value.trim();
    var token = Twig.logic.tokenize.call(this, expression);
    var tokenTemplate = Twig.logic.handler[token.type]; // Check if the token needs compiling

    if (tokenTemplate.compile) {
      token = tokenTemplate.compile.call(this, token);
      Twig.log.trace('Twig.logic.compile: ', 'Compiled logic token to ', token);
    }

    return token;
  };
  /**
   * Tokenize logic expressions. This function matches token expressions against regular
   * expressions provided in token definitions provided with Twig.logic.extend.
   *
   * @param {string} expression the logic token expression to tokenize
   *                (i.e. what's between {% and %})
   *
   * @return {Object} The matched token with type set to the token type and match to the regex match.
   */


  Twig.logic.tokenize = function (expression) {
    var tokenTemplateType = null;
    var tokenType = null;
    var tokenRegex = null;
    var regexArray = null;
    var regexLen = null;
    var regexI = null;
    var match = null; // Ignore whitespace around expressions.

    expression = expression.trim();

    for (tokenTemplateType in Twig.logic.handler) {
      if (Object.hasOwnProperty.call(Twig.logic.handler, tokenTemplateType)) {
        // Get the type and regex for this template type
        tokenType = Twig.logic.handler[tokenTemplateType].type;
        tokenRegex = Twig.logic.handler[tokenTemplateType].regex; // Handle multiple regular expressions per type.

        regexArray = tokenRegex;

        if (!Array.isArray(tokenRegex)) {
          regexArray = [tokenRegex];
        }

        regexLen = regexArray.length; // Check regular expressions in the order they were specified in the definition.

        for (regexI = 0; regexI < regexLen; regexI++) {
          match = regexArray[regexI].exec(expression);

          if (match !== null) {
            Twig.log.trace('Twig.logic.tokenize: ', 'Matched a ', tokenType, ' regular expression of ', match);
            return {
              type: tokenType,
              match: match
            };
          }
        }
      }
    } // No regex matches


    throw new Twig.Error('Unable to parse \'' + expression.trim() + '\'');
  };
  /**
   * Parse a logic token within a given context.
   *
   * What are logic chains?
   *      Logic chains represent a series of tokens that are connected,
   *          for example:
   *          {% if ... %} {% else %} {% endif %}
   *
   *      The chain parameter is used to signify if a chain is open of closed.
   *      open:
   *          More tokens in this chain should be parsed.
   *      closed:
   *          This token chain has completed parsing and any additional
   *          tokens (else, elseif, etc...) should be ignored.
   *
   * @param {Object} token The compiled token.
   * @param {Object} context The render context.
   * @param {boolean} chain Is this an open logic chain. If false, that means a
   *                        chain is closed and no further cases should be parsed.
   */


  Twig.logic.parse = function (token, context, chain, allowAsync) {
    return Twig.async.potentiallyAsync(this, allowAsync, function () {
      Twig.log.debug('Twig.logic.parse: ', 'Parsing logic token ', token);
      var tokenTemplate = Twig.logic.handler[token.type];
      var result;
      var state = this;

      if (!tokenTemplate.parse) {
        return '';
      }

      state.nestingStack.unshift(token);
      result = tokenTemplate.parse.call(state, token, context || {}, chain);

      if (Twig.isPromise(result)) {
        result = result.then(function (result) {
          state.nestingStack.shift();
          return result;
        });
      } else {
        state.nestingStack.shift();
      }

      return result;
    });
  };

  return Twig;
};

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (Twig) {
  'use strict';

  Twig.Templates.registerParser('source', function (params) {
    return params.data || '';
  });
};

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (Twig) {
  'use strict';

  Twig.Templates.registerParser('twig', function (params) {
    return new Twig.Template(params);
  });
};

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _interopRequireDefault = __webpack_require__(0);

var _typeof2 = _interopRequireDefault(__webpack_require__(1));

// ## twig.path.js
//
// This file handles path parsing
module.exports = function (Twig) {
  'use strict';
  /**
   * Namespace for path handling.
   */

  Twig.path = {};
  /**
   * Generate the canonical version of a url based on the given base path and file path and in
   * the previously registered namespaces.
   *
   * @param  {string} template The Twig Template
   * @param  {string} _file    The file path, may be relative and may contain namespaces.
   *
   * @return {string}          The canonical version of the path
   */

  Twig.path.parsePath = function (template, _file) {
    var k = null;
    var namespaces = template.options.namespaces;
    var file = _file || '';
    var hasNamespaces = namespaces && (0, _typeof2["default"])(namespaces) === 'object';

    if (hasNamespaces) {
      for (k in namespaces) {
        if (!file.includes(k)) {
          continue;
        } // Check if keyed namespace exists at path's start


        var colon = new RegExp('^' + k + '::');
        var atSign = new RegExp('^@' + k + '/'); // Add slash to the end of path

        var namespacePath = namespaces[k].replace(/([^/])$/, '$1/');

        if (colon.test(file)) {
          file = file.replace(colon, namespacePath);
          return file;
        }

        if (atSign.test(file)) {
          file = file.replace(atSign, namespacePath);
          return file;
        }
      }
    }

    return Twig.path.relativePath(template, file);
  };
  /**
   * Generate the relative canonical version of a url based on the given base path and file path.
   *
   * @param {Twig.Template} template The Twig.Template.
   * @param {string} _file The file path, relative to the base path.
   *
   * @return {string} The canonical version of the path.
   */


  Twig.path.relativePath = function (template, _file) {
    var base;
    var basePath;
    var sepChr = '/';
    var newPath = [];
    var file = _file || '';
    var val;

    if (template.url) {
      if (typeof template.base === 'undefined') {
        base = template.url;
      } else {
        // Add slash to the end of path
        base = template.base.replace(/([^/])$/, '$1/');
      }
    } else if (template.path) {
      // Get the system-specific path separator
      var path = __webpack_require__(6);

      var sep = path.sep || sepChr;
      var relative = new RegExp('^\\.{1,2}' + sep.replace('\\', '\\\\'));
      file = file.replace(/\//g, sep);

      if (template.base !== undefined && file.match(relative) === null) {
        file = file.replace(template.base, '');
        base = template.base + sep;
      } else {
        base = path.normalize(template.path);
      }

      base = base.replace(sep + sep, sep);
      sepChr = sep;
    } else if ((template.name || template.id) && template.method && template.method !== 'fs' && template.method !== 'ajax') {
      // Custom registered loader
      base = template.base || template.name || template.id;
    } else {
      throw new Twig.Error('Cannot extend an inline template.');
    }

    basePath = base.split(sepChr); // Remove file from url

    basePath.pop();
    basePath = basePath.concat(file.split(sepChr));

    while (basePath.length > 0) {
      val = basePath.shift();

      if (val === '.') {// Ignore
      } else if (val === '..' && newPath.length > 0 && newPath[newPath.length - 1] !== '..') {
        newPath.pop();
      } else {
        newPath.push(val);
      }
    }

    return newPath.join(sepChr);
  };

  return Twig;
};

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.tests.js
//
// This file handles expression tests. (is empty, is not defined, etc...)
module.exports = function (Twig) {
  'use strict';

  Twig.tests = {
    empty: function empty(value) {
      if (value === null || value === undefined) {
        return true;
      } // Handler numbers


      if (typeof value === 'number') {
        return false;
      } // Numbers are never "empty"
      // Handle strings and arrays


      if (value.length > 0) {
        return false;
      } // Handle objects


      for (var key in value) {
        if (Object.hasOwnProperty.call(value, key)) {
          return false;
        }
      }

      return true;
    },
    odd: function odd(value) {
      return value % 2 === 1;
    },
    even: function even(value) {
      return value % 2 === 0;
    },
    divisibleby: function divisibleby(value, params) {
      return value % params[0] === 0;
    },
    defined: function defined(value) {
      return value !== undefined;
    },
    none: function none(value) {
      return value === null;
    },
    "null": function _null(value) {
      return this.none(value); // Alias of none
    },
    'same as': function sameAs(value, params) {
      return value === params[0];
    },
    sameas: function sameas(value, params) {
      console.warn('`sameas` is deprecated use `same as`');
      return Twig.tests['same as'](value, params);
    },
    iterable: function iterable(value) {
      return value && (Twig.lib.is('Array', value) || Twig.lib.is('Object', value));
    }
    /*
    Constant ?
     */

  };

  Twig.test = function (test, value, params) {
    if (!Twig.tests[test]) {
      throw Twig.Error('Test ' + test + ' is not defined.');
    }

    return Twig.tests[test](value, params);
  };

  Twig.test.extend = function (test, definition) {
    Twig.tests[test] = definition;
  };

  return Twig;
};

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.async.js
//
// This file handles asynchronous tasks within twig.
module.exports = function (Twig) {
  'use strict';

  var STATE_UNKNOWN = 0;
  var STATE_RESOLVED = 1;
  var STATE_REJECTED = 2;

  Twig.ParseState.prototype.parseAsync = function (tokens, context) {
    return this.parse(tokens, context, true);
  };

  Twig.expression.parseAsync = function (tokens, context, tokensAreParameters) {
    var state = this;
    return Twig.expression.parse.call(state, tokens, context, tokensAreParameters, true);
  };

  Twig.logic.parseAsync = function (token, context, chain) {
    var state = this;
    return Twig.logic.parse.call(state, token, context, chain, true);
  };

  Twig.Template.prototype.renderAsync = function (context, params) {
    return this.render(context, params, true);
  };

  Twig.async = {};
  /**
   * Checks for `thenable` objects
   */

  Twig.isPromise = function (obj) {
    return obj && obj.then && typeof obj.then === 'function';
  };
  /**
   * Handling of code paths that might either return a promise
   * or a value depending on whether async code is used.
   *
   * @see https://github.com/twigjs/twig.js/blob/master/ASYNC.md#detecting-asynchronous-behaviour
   */


  function potentiallyAsyncSlow(that, allowAsync, action) {
    var result = action.call(that);
    var err = null;
    var isAsync = true;

    if (!Twig.isPromise(result)) {
      return result;
    }

    result.then(function (res) {
      result = res;
      isAsync = false;
    })["catch"](function (error) {
      err = error;
    });

    if (err !== null) {
      throw err;
    }

    if (isAsync) {
      throw new Twig.Error('You are using Twig.js in sync mode in combination with async extensions.');
    }

    return result;
  }

  Twig.async.potentiallyAsync = function (that, allowAsync, action) {
    if (allowAsync) {
      return Twig.Promise.resolve(action.call(that));
    }

    return potentiallyAsyncSlow(that, allowAsync, action);
  };

  function run(fn, resolve, reject) {
    try {
      fn(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  function pending(handlers, onResolved, onRejected) {
    var h = [onResolved, onRejected, -2]; // The promise has yet to be rejected or resolved.

    if (!handlers) {
      handlers = h;
    } else if (handlers[2] === -2) {
      // Only allocate an array when there are multiple handlers
      handlers = [handlers, h];
    } else {
      handlers.push(h);
    }

    return handlers;
  }
  /**
   * Really small thenable to represent promises that resolve immediately.
   *
   */


  Twig.Thenable = function (then, value, state) {
    this.then = then;
    this._value = state ? value : null;
    this._state = state || STATE_UNKNOWN;
  };

  Twig.Thenable.prototype["catch"] = function (onRejected) {
    // THe promise will not throw, it has already resolved.
    if (this._state === STATE_RESOLVED) {
      return this;
    }

    return this.then(null, onRejected);
  };
  /**
   * The `then` method attached to a Thenable when it has resolved.
   *
   */


  Twig.Thenable.resolvedThen = function (onResolved) {
    try {
      return Twig.Promise.resolve(onResolved(this._value));
    } catch (error) {
      return Twig.Promise.reject(error);
    }
  };
  /**
   * The `then` method attached to a Thenable when it has rejected.
   *
   */


  Twig.Thenable.rejectedThen = function (onResolved, onRejected) {
    // Shortcut for rejected twig promises
    if (!onRejected || typeof onRejected !== 'function') {
      return this;
    }

    var value = this._value;
    var result;

    try {
      result = onRejected(value);
    } catch (error) {
      result = Twig.Promise.reject(error);
    }

    return Twig.Promise.resolve(result);
  };
  /**
   * An alternate implementation of a Promise that does not fully follow
   * the spec, but instead works fully synchronous while still being
   * thenable.
   *
   * These promises can be mixed with regular promises at which point
   * the synchronous behaviour is lost.
   */


  Twig.Promise = function (executor) {
    var state = STATE_UNKNOWN;
    var value = null;

    var changeState = function changeState(nextState, nextValue) {
      state = nextState;
      value = nextValue;
    };

    function onReady(v) {
      changeState(STATE_RESOLVED, v);
    }

    function onReject(e) {
      changeState(STATE_REJECTED, e);
    }

    run(executor, onReady, onReject); // If the promise settles right after running the executor we can
    // return a Promise with it's state already set.
    //
    // Twig.Promise.resolve and Twig.Promise.reject both use the more
    // efficient `Twig.Thenable` for this purpose.

    if (state === STATE_RESOLVED) {
      return Twig.Promise.resolve(value);
    }

    if (state === STATE_REJECTED) {
      return Twig.Promise.reject(value);
    } // If we managed to get here our promise is going to resolve asynchronous.


    changeState = new Twig.FullPromise();
    return changeState.promise;
  };
  /**
   * Promise implementation that can handle being resolved at any later time.
   *
   */


  Twig.FullPromise = function () {
    var handlers = null; // The state has been changed to either resolve, or reject
    // which means we should call the handler.

    function resolved(onResolved) {
      onResolved(p._value);
    }

    function rejected(onResolved, onRejected) {
      onRejected(p._value);
    }

    var append = function append(onResolved, onRejected) {
      handlers = pending(handlers, onResolved, onRejected);
    };

    function changeState(newState, v) {
      if (p._state) {
        return;
      }

      p._value = v;
      p._state = newState;
      append = newState === STATE_RESOLVED ? resolved : rejected;

      if (!handlers) {
        return;
      }

      if (handlers[2] === -2) {
        append(handlers[0], handlers[1]);
        handlers = null;
        return;
      }

      handlers.forEach(function (h) {
        append(h[0], h[1]);
      });
      handlers = null;
    }

    var p = new Twig.Thenable(function (onResolved, onRejected) {
      var hasResolved = typeof onResolved === 'function'; // Shortcut for resolved twig promises

      if (p._state === STATE_RESOLVED && !hasResolved) {
        return Twig.Promise.resolve(p._value);
      }

      if (p._state === STATE_RESOLVED) {
        try {
          return Twig.Promise.resolve(onResolved(p._value));
        } catch (error) {
          return Twig.Promise.reject(error);
        }
      }

      var hasRejected = typeof onRejected === 'function';
      return new Twig.Promise(function (resolve, reject) {
        append(hasResolved ? function (result) {
          try {
            resolve(onResolved(result));
          } catch (error) {
            reject(error);
          }
        } : resolve, hasRejected ? function (err) {
          try {
            resolve(onRejected(err));
          } catch (error) {
            reject(error);
          }
        } : reject);
      });
    });
    changeState.promise = p;
    return changeState;
  };

  Twig.Promise.defaultResolved = new Twig.Thenable(Twig.Thenable.resolvedThen, undefined, STATE_RESOLVED);
  Twig.Promise.emptyStringResolved = new Twig.Thenable(Twig.Thenable.resolvedThen, '', STATE_RESOLVED);

  Twig.Promise.resolve = function (value) {
    if (arguments.length === 0 || typeof value === 'undefined') {
      return Twig.Promise.defaultResolved;
    }

    if (Twig.isPromise(value)) {
      return value;
    } // Twig often resolves with an empty string, we optimize for this
    // scenario by returning a fixed promise. This reduces the load on
    // garbage collection.


    if (value === '') {
      return Twig.Promise.emptyStringResolved;
    }

    return new Twig.Thenable(Twig.Thenable.resolvedThen, value, STATE_RESOLVED);
  };

  Twig.Promise.reject = function (e) {
    // `e` should never be a promise.
    return new Twig.Thenable(Twig.Thenable.rejectedThen, e, STATE_REJECTED);
  };

  Twig.Promise.all = function (promises) {
    var results = new Array(promises.length);
    return Twig.async.forEach(promises, function (p, index) {
      if (!Twig.isPromise(p)) {
        results[index] = p;
        return;
      }

      if (p._state === STATE_RESOLVED) {
        results[index] = p._value;
        return;
      }

      return p.then(function (v) {
        results[index] = v;
      });
    }).then(function () {
      return results;
    });
  };
  /**
  * Go over each item in a fashion compatible with Twig.forEach,
  * allow the function to return a promise or call the third argument
  * to signal it is finished.
  *
  * Each item in the array will be called sequentially.
  */


  Twig.async.forEach = function (arr, callback) {
    var len = arr ? arr.length : 0;
    var index = 0;

    function next() {
      var resp = null;

      do {
        if (index === len) {
          return Twig.Promise.resolve();
        }

        resp = callback(arr[index], index);
        index++; // While the result of the callback is not a promise or it is
        // a promise that has settled we can use a regular loop which
        // is much faster.
      } while (!resp || !Twig.isPromise(resp) || resp._state === STATE_RESOLVED);

      return resp.then(next);
    }

    return next();
  };

  return Twig;
};

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// ## twig.exports.js
//
// This file provides extension points and other hooks into the twig functionality.
module.exports = function (Twig) {
  'use strict';

  Twig.exports = {
    VERSION: Twig.VERSION
  };
  /**
   * Create and compile a twig.js template.
   *
   * @param {Object} param Paramteres for creating a Twig template.
   *
   * @return {Twig.Template} A Twig template ready for rendering.
   */

  Twig.exports.twig = function (params) {
    'use strict';

    var id = params.id;
    var options = {
      strictVariables: params.strict_variables || false,
      // TODO: turn autoscape on in the next major version
      autoescape: params.autoescape !== null && params.autoescape || false,
      allowInlineIncludes: params.allowInlineIncludes || false,
      rethrow: params.rethrow || false,
      namespaces: params.namespaces
    };

    if (Twig.cache && id) {
      Twig.validateId(id);
    }

    if (params.debug !== undefined) {
      Twig.debug = params.debug;
    }

    if (params.trace !== undefined) {
      Twig.trace = params.trace;
    }

    if (params.data !== undefined) {
      return Twig.Templates.parsers.twig({
        data: params.data,
        path: Object.hasOwnProperty.call(params, 'path') ? params.path : undefined,
        module: params.module,
        id: id,
        options: options
      });
    }

    if (params.ref !== undefined) {
      if (params.id !== undefined) {
        throw new Twig.Error('Both ref and id cannot be set on a twig.js template.');
      }

      return Twig.Templates.load(params.ref);
    }

    if (params.method !== undefined) {
      if (!Twig.Templates.isRegisteredLoader(params.method)) {
        throw new Twig.Error('Loader for "' + params.method + '" is not defined.');
      }

      return Twig.Templates.loadRemote(params.name || params.href || params.path || id || undefined, {
        id: id,
        method: params.method,
        parser: params.parser || 'twig',
        base: params.base,
        module: params.module,
        precompiled: params.precompiled,
        async: params.async,
        options: options
      }, params.load, params.error);
    }

    if (params.href !== undefined) {
      return Twig.Templates.loadRemote(params.href, {
        id: id,
        method: 'ajax',
        parser: params.parser || 'twig',
        base: params.base,
        module: params.module,
        precompiled: params.precompiled,
        async: params.async,
        options: options
      }, params.load, params.error);
    }

    if (params.path !== undefined) {
      return Twig.Templates.loadRemote(params.path, {
        id: id,
        method: 'fs',
        parser: params.parser || 'twig',
        base: params.base,
        module: params.module,
        precompiled: params.precompiled,
        async: params.async,
        options: options
      }, params.load, params.error);
    }
  }; // Extend Twig with a new filter.


  Twig.exports.extendFilter = function (filter, definition) {
    Twig.filter.extend(filter, definition);
  }; // Extend Twig with a new function.


  Twig.exports.extendFunction = function (fn, definition) {
    Twig._function.extend(fn, definition);
  }; // Extend Twig with a new test.


  Twig.exports.extendTest = function (test, definition) {
    Twig.test.extend(test, definition);
  }; // Extend Twig with a new definition.


  Twig.exports.extendTag = function (definition) {
    Twig.logic.extend(definition);
  }; // Provide an environment for extending Twig core.
  // Calls fn with the internal Twig object.


  Twig.exports.extend = function (fn) {
    fn(Twig);
  };
  /**
   * Provide an extension for use with express 2.
   *
   * @param {string} markup The template markup.
   * @param {array} options The express options.
   *
   * @return {string} The rendered template.
   */


  Twig.exports.compile = function (markup, options) {
    var id = options.filename;
    var path = options.filename; // Try to load the template from the cache

    var template = new Twig.Template({
      data: markup,
      path: path,
      id: id,
      options: options.settings['twig options']
    }); // Twig.Templates.load(id) ||

    return function (context) {
      return template.render(context);
    };
  };
  /**
   * Provide an extension for use with express 3.
   *
   * @param {string} path The location of the template file on disk.
   * @param {Object|Function} The options or callback.
   * @param {Function} fn callback.
   *
   * @throws Twig.Error
   */


  Twig.exports.renderFile = function (path, options, fn) {
    // Handle callback in options
    if (typeof options === 'function') {
      fn = options;
      options = {};
    }

    options = options || {};
    var settings = options.settings || {}; // Mixin any options provided to the express app.

    var viewOptions = settings['twig options'];
    var params = {
      path: path,
      base: settings.views,
      load: function load(template) {
        // Render and return template as a simple string, see https://github.com/twigjs/twig.js/pull/348 for more information
        if (!viewOptions || !viewOptions.allowAsync) {
          fn(null, String(template.render(options)));
          return;
        }

        template.renderAsync(options).then(function (out) {
          return fn(null, out);
        }, fn);
      },
      error: function error(err) {
        fn(err);
      }
    };

    if (viewOptions) {
      for (var option in viewOptions) {
        if (Object.hasOwnProperty.call(viewOptions, option)) {
          params[option] = viewOptions[option];
        }
      }
    }

    Twig.exports.twig(params);
  }; // Express 3 handler


  Twig.exports.__express = Twig.exports.renderFile;
  /**
   * Shoud Twig.js cache templates.
   * Disable during development to see changes to templates without
   * reloading, and disable in production to improve performance.
   *
   * @param {boolean} cache
   */

  Twig.exports.cache = function (cache) {
    Twig.cache = cache;
  }; // We need to export the path module so we can effectively test it


  Twig.exports.path = Twig.path; // Export our filters.
  // Resolves #307

  Twig.exports.filters = Twig.filters; // Export our tests.

  Twig.exports.tests = Twig.tests; // Export our functions.

  Twig.exports.functions = Twig.functions;
  Twig.exports.Promise = Twig.Promise;
  return Twig;
};

/***/ })
/******/ ]);
});
}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"fs":9,"path":10}],5:[function(require,module,exports){
var Twig = require('twig');

module.exports = Twig.twig({
    id: 'guessers-fakers',
    allowInlineIncludes: true,
    data: `
<div class="guesser-faker-container" id="guessers">
    <h3>{{ lang.guessers }}</h3>

    {% if guessers is empty %}
        {{ lang.noGuessers }}
    {% else %}

        <ul class="guessers">
            {% for guesser in guessers %}
                <li>{{ guesser.name }}</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>

<div class="guesser-faker-container" id="fakers">
    <h3>{{ lang.fakers }}</h3>
    {% if fakers is empty %}
        {{ lang.noFakers }}
    {% else %}
        <ul class="fakers">
            {% for faker in fakers %}
                <li>{{ faker.name }}</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>
`
});
},{"twig":4}],6:[function(require,module,exports){
var Twig = require('twig');

module.exports = Twig.twig({
    id: 'prepare',
    allowInlineIncludes: true,
    data: `
<div class="container">
    <div class="flex-container">
    
        <div class="flex-item">
    
            <div class="join-container">
                <h3>{{ lang.yourName }}</h3>
                <input type="text" class="form-control js-name">
            </div>
    
            <div class="join-container">
                {{ lang.yourWordIntro }}
                <label>
                    {{ lang.yourWord }}
                    <input type="text" class="form-control js-word">
                </label>
                <button class="btn btn-secondary text-center js-join-fakers">{{ lang.joinFakers }}</button>
            </div>
    
            <div class="join-container">
                <h3>{{ lang.joinGuessersIntro }}</h3>
                <button class="btn btn-secondary text-center js-join-guessers">{{ lang.joinGuessers }}</button>
            </div>
    
        </div>
    
        <div class="flex-item" id="guesser-faker-container">
            {% include 'guessers-fakers' %}
        </div>
    
    </div>
    
    <div class="flex-container">
    
        <div class="flex-item">
            <label>{{ lang.share }}
                <input type="text" class="form-control js-share" readonly value="{{ address }}">
            </label>
        </div>
    
        <div class="flex-item">
            <button class="btn btn-primary btn-lg text-center js-start-round">{{ lang.startRound }}</button>
        </div>
    
    </div>
</div>
`
});
},{"twig":4}],7:[function(require,module,exports){
var Twig = require('twig');

module.exports = Twig.twig({
    id: 'revelation',
    allowInlineIncludes: true,
    data: `
<div class="container container-revelation">
    <h4>{{ lang.revelationWord }}</h4>
    <div class="chosen-word">{{ word }}</div>
    
    <div class="votes-result">
        {% for faker in fakers %}
            <div class="vote-result {% if faker.wasChosen == true %}vote-result--chosen{% endif %}">
                <div class="btn btn-large btn-non-clickable {% if faker.wasChosen == true %}btn-primary{% else %}btn-secondary{% endif %}">
                    {{ faker.name }}{% if faker.wasChosen == true %}<br><small>{{ lang.wasRight }}</small>{% endif %}
                </div>
                <ul class="voted-for">
                    {% for voter in faker.votedFor %}
                        <li>{{ voter }}</li>
                    {% endfor %}
                </ul>
            </div>
        {% endfor %}
    </div>
    
    {% for wiki in wikipedia %}
    <p>{{ wiki.text }}</p>
    <p><a href="{{ wiki.link }}" target="_blank">{{ lang.readWikipedia}}</a></p>
    {% endfor %}

    <button class="btn btn-primary btn-lg text-center js-restart">{{ lang.restart }}</button>
</div>
`
});
},{"twig":4}],8:[function(require,module,exports){
var Twig = require('twig');

module.exports = Twig.twig({
    id: 'round-running',
    allowInlineIncludes: true,
    data: `
<div class="container container-round-running">
    <h4>{{ lang.roundRunningWord }}</h4>
    <div class="chosen-word">{{ word }}</div>

    {% if ownWord == true %}
        <p>{{ lang.ownWord }}</p>
    
        <div class="votes">
            {% for faker in fakers %}
                <div class="btn btn-large btn-secondary btn-non-clickable">{{ faker.name }}</div>
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}{{ lang.votesRemaining1 }}{% else %}{{ votesRemaining }} {{ lang.votesRemainingN }}{% endif %}</p>
    {% elseif canVote == false %}
        <p>{{ lang.noVoteForSpectator }}</p>
    
        <div class="votes">
            {% for faker in fakers %}
                <div class="btn btn-large btn-secondary btn-non-clickable">{{ faker.name }}</div>
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}{{ lang.votesRemaining1 }}{% else %}{{ votesRemaining }} {{ lang.votesRemainingN }}{% endif %}</p>
    {% else %}
        <h4>{{ lang.voteHeading }}</h4>
        <div class="votes">
            {% for faker in fakers %}
                {% if vote is empty %}
                    <div class="btn btn-large btn-primary js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% elseif vote == faker.voteid %}
                    <div class="btn btn-large btn-primary btn-selected js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% else %} 
                    <div class="btn btn-large btn-secondary js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% endif %}
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}
            {% if vote is empty %}{{ lang.votesRemaining1You }}{% else %}{{ lang.votesRemaining1 }}{% endif %}
        {% else %}
            {{ votesRemaining }} {% if vote is empty %}{{ lang.votesRemainingNYou }}{% else %}{{ lang.votesRemainingN }}{% endif %}
        {% endif %}
    {% endif %}
    <div class="btn btn-primary js-finish-voting">{{ lang.finishVoting }}</div>
</div>
`
});
},{"twig":4}],9:[function(require,module,exports){

},{}],10:[function(require,module,exports){
(function (process){(function (){
// 'path' module extracted from Node.js v8.11.1 (only the posix part)
// transplited with Babel

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

function assertPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError('Path must be a string. Received ' + JSON.stringify(path));
  }
}

// Resolves . and .. elements in a path with directory names
function normalizeStringPosix(path, allowAboveRoot) {
  var res = '';
  var lastSegmentLength = 0;
  var lastSlash = -1;
  var dots = 0;
  var code;
  for (var i = 0; i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47 /*/*/)
      break;
    else
      code = 47 /*/*/;
    if (code === 47 /*/*/) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ || res.charCodeAt(res.length - 2) !== 46 /*.*/) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf('/');
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = '';
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = '';
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += '/..';
          else
            res = '..';
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += '/' + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 /*.*/ && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root;
  var base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');
  if (!dir) {
    return base;
  }
  if (dir === pathObject.root) {
    return dir + base;
  }
  return dir + sep + base;
}

var posix = {
  // path.resolve([from ...], to)
  resolve: function resolve() {
    var resolvedPath = '';
    var resolvedAbsolute = false;
    var cwd;

    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path;
      if (i >= 0)
        path = arguments[i];
      else {
        if (cwd === undefined)
          cwd = process.cwd();
        path = cwd;
      }

      assertPath(path);

      // Skip empty entries
      if (path.length === 0) {
        continue;
      }

      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/;
    }

    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)

    // Normalize the path
    resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);

    if (resolvedAbsolute) {
      if (resolvedPath.length > 0)
        return '/' + resolvedPath;
      else
        return '/';
    } else if (resolvedPath.length > 0) {
      return resolvedPath;
    } else {
      return '.';
    }
  },

  normalize: function normalize(path) {
    assertPath(path);

    if (path.length === 0) return '.';

    var isAbsolute = path.charCodeAt(0) === 47 /*/*/;
    var trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/;

    // Normalize the path
    path = normalizeStringPosix(path, !isAbsolute);

    if (path.length === 0 && !isAbsolute) path = '.';
    if (path.length > 0 && trailingSeparator) path += '/';

    if (isAbsolute) return '/' + path;
    return path;
  },

  isAbsolute: function isAbsolute(path) {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/;
  },

  join: function join() {
    if (arguments.length === 0)
      return '.';
    var joined;
    for (var i = 0; i < arguments.length; ++i) {
      var arg = arguments[i];
      assertPath(arg);
      if (arg.length > 0) {
        if (joined === undefined)
          joined = arg;
        else
          joined += '/' + arg;
      }
    }
    if (joined === undefined)
      return '.';
    return posix.normalize(joined);
  },

  relative: function relative(from, to) {
    assertPath(from);
    assertPath(to);

    if (from === to) return '';

    from = posix.resolve(from);
    to = posix.resolve(to);

    if (from === to) return '';

    // Trim any leading backslashes
    var fromStart = 1;
    for (; fromStart < from.length; ++fromStart) {
      if (from.charCodeAt(fromStart) !== 47 /*/*/)
        break;
    }
    var fromEnd = from.length;
    var fromLen = fromEnd - fromStart;

    // Trim any leading backslashes
    var toStart = 1;
    for (; toStart < to.length; ++toStart) {
      if (to.charCodeAt(toStart) !== 47 /*/*/)
        break;
    }
    var toEnd = to.length;
    var toLen = toEnd - toStart;

    // Compare paths to find the longest common path from root
    var length = fromLen < toLen ? fromLen : toLen;
    var lastCommonSep = -1;
    var i = 0;
    for (; i <= length; ++i) {
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
            // We get here if `from` is the exact base path for `to`.
            // For example: from='/foo/bar'; to='/foo/bar/baz'
            return to.slice(toStart + i + 1);
          } else if (i === 0) {
            // We get here if `from` is the root
            // For example: from='/'; to='/foo'
            return to.slice(toStart + i);
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
            // We get here if `to` is the exact base path for `from`.
            // For example: from='/foo/bar/baz'; to='/foo/bar'
            lastCommonSep = i;
          } else if (i === 0) {
            // We get here if `to` is the root.
            // For example: from='/foo'; to='/'
            lastCommonSep = 0;
          }
        }
        break;
      }
      var fromCode = from.charCodeAt(fromStart + i);
      var toCode = to.charCodeAt(toStart + i);
      if (fromCode !== toCode)
        break;
      else if (fromCode === 47 /*/*/)
        lastCommonSep = i;
    }

    var out = '';
    // Generate the relative path based on the path difference between `to`
    // and `from`
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
        if (out.length === 0)
          out += '..';
        else
          out += '/..';
      }
    }

    // Lastly, append the rest of the destination (`to`) path that comes after
    // the common path parts
    if (out.length > 0)
      return out + to.slice(toStart + lastCommonSep);
    else {
      toStart += lastCommonSep;
      if (to.charCodeAt(toStart) === 47 /*/*/)
        ++toStart;
      return to.slice(toStart);
    }
  },

  _makeLong: function _makeLong(path) {
    return path;
  },

  dirname: function dirname(path) {
    assertPath(path);
    if (path.length === 0) return '.';
    var code = path.charCodeAt(0);
    var hasRoot = code === 47 /*/*/;
    var end = -1;
    var matchedSlash = true;
    for (var i = path.length - 1; i >= 1; --i) {
      code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          if (!matchedSlash) {
            end = i;
            break;
          }
        } else {
        // We saw the first non-path separator
        matchedSlash = false;
      }
    }

    if (end === -1) return hasRoot ? '/' : '.';
    if (hasRoot && end === 1) return '//';
    return path.slice(0, end);
  },

  basename: function basename(path, ext) {
    if (ext !== undefined && typeof ext !== 'string') throw new TypeError('"ext" argument must be a string');
    assertPath(path);

    var start = 0;
    var end = -1;
    var matchedSlash = true;
    var i;

    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
      if (ext.length === path.length && ext === path) return '';
      var extIdx = ext.length - 1;
      var firstNonSlashEnd = -1;
      for (i = path.length - 1; i >= 0; --i) {
        var code = path.charCodeAt(i);
        if (code === 47 /*/*/) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else {
          if (firstNonSlashEnd === -1) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            // Try to match the explicit extension
            if (code === ext.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = i;
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }

      if (start === end) end = firstNonSlashEnd;else if (end === -1) end = path.length;
      return path.slice(start, end);
    } else {
      for (i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === 47 /*/*/) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else if (end === -1) {
          // We saw the first non-path separator, mark this as the end of our
          // path component
          matchedSlash = false;
          end = i + 1;
        }
      }

      if (end === -1) return '';
      return path.slice(start, end);
    }
  },

  extname: function extname(path) {
    assertPath(path);
    var startDot = -1;
    var startPart = 0;
    var end = -1;
    var matchedSlash = true;
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    var preDotState = 0;
    for (var i = path.length - 1; i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46 /*.*/) {
          // If this is our first dot, mark it as the start of our extension
          if (startDot === -1)
            startDot = i;
          else if (preDotState !== 1)
            preDotState = 1;
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1;
      }
    }

    if (startDot === -1 || end === -1 ||
        // We saw a non-dot character immediately before the dot
        preDotState === 0 ||
        // The (right-most) trimmed path component is exactly '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return '';
    }
    return path.slice(startDot, end);
  },

  format: function format(pathObject) {
    if (pathObject === null || typeof pathObject !== 'object') {
      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
    }
    return _format('/', pathObject);
  },

  parse: function parse(path) {
    assertPath(path);

    var ret = { root: '', dir: '', base: '', ext: '', name: '' };
    if (path.length === 0) return ret;
    var code = path.charCodeAt(0);
    var isAbsolute = code === 47 /*/*/;
    var start;
    if (isAbsolute) {
      ret.root = '/';
      start = 1;
    } else {
      start = 0;
    }
    var startDot = -1;
    var startPart = 0;
    var end = -1;
    var matchedSlash = true;
    var i = path.length - 1;

    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    var preDotState = 0;

    // Get non-dir info
    for (; i >= start; --i) {
      code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46 /*.*/) {
          // If this is our first dot, mark it as the start of our extension
          if (startDot === -1) startDot = i;else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1;
      }
    }

    if (startDot === -1 || end === -1 ||
    // We saw a non-dot character immediately before the dot
    preDotState === 0 ||
    // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      if (end !== -1) {
        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end);else ret.base = ret.name = path.slice(startPart, end);
      }
    } else {
      if (startPart === 0 && isAbsolute) {
        ret.name = path.slice(1, startDot);
        ret.base = path.slice(1, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
      }
      ret.ext = path.slice(startDot, end);
    }

    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);else if (isAbsolute) ret.dir = '/';

    return ret;
  },

  sep: '/',
  delimiter: ':',
  win32: null,
  posix: null
};

posix.posix = posix;

module.exports = posix;

}).call(this)}).call(this,require('_process'))
},{"_process":11}],11:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[2]);
