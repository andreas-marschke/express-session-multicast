"use strict";
var SilentLogger = require("./SilentLogger");
var assert = require("chai").assert;

describe("Multicast",function() {
    describe("Serializer",function() {

	it("Should work on require()", function(){
	    require("../lib/serialization.js");
	});

	it("Should initialize properly", function(){
	    var Serializer = require("../lib/serialization.js");
	    var serializer = new Serializer();

	    assert.instanceOf(serializer, Serializer);
	    assert.instanceOf(serializer.log, console.constructor);
	});

	it("Should serialize a Buffer containing JSON", function() {
	    var Serializer = require("../lib/serialization.js");
	    var serializer = new Serializer(SilentLogger);

	    var input = new Buffer('{"a":"1","b":2}');
	    var expected = {a:'1',b:2};
	    assert.deepEqual(serializer.serialize(input), expected, 'Serialized output matches: {"a":"1","b":2}');
	});

	it("Should deserialize an object to a Buffer", function(){
	    var Serializer = require("../lib/serialization.js");
	    var serializer = new Serializer(SilentLogger);

	    var input = {
		a: "1",
		b: 2
	    };
	    var expected = new Buffer('{"a":"1","b":2}');

	    assert.deepEqual(serializer.deserialize(input), expected);
	});

	it("Should return null on errornouse JSON or content", function(){
	    var Serializer = require("../lib/serialization.js");
	    var serializer = new Serializer(SilentLogger);

	    var input = new Buffer('{"a":"1"');
	    assert.isNull(serializer.serialize(input));
	});
    });
});
