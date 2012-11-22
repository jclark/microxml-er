"use strict";

var mode = {};
var defaultHandler = {};
var re = {};

re.COMMENT_OPEN = "<!--";
re.COMMENT_CLOSE = "-->";
re.DATA_CHAR = "([\u0000-\uFFFF])";
re.S = "[\f\t\n ]";
re.HEX_NUMBER = "[0-9A-fA-F]+";
re.NAME_START_CHAR = "[A-Za-z_:$]";
re.NAME_CHAR = "[-.0-9" + re.NAME_START_CHAR.slice(1);
re.NAME = re.NAME_START_CHAR + re.NAME_CHAR + "*";
re.NAMED_CHAR_REF = "&(" + re.NAME + ");";
re.NUMERIC_CHAR_REF = "&#x(" + re.HEX_NUMBER + ");";
re.ATTRIBUTE_NAME_EQUALS = re.S + "*" + "(" + re.NAME + ")" + re.S + "*=";
re.START_TAG_OPEN = "<(" + re.NAME + ")";
re.START_TAG_ATTRIBUTE = re.START_TAG_OPEN + re.S + "+" + re.ATTRIBUTE_NAME_EQUALS;
re.START_TAG_CLOSE = ">";
re.EMPTY_ELEMENT_TAG_CLOSE = "/>";
re.SIMPLE_START_TAG = re.START_TAG_OPEN + re.S + "*" + re.START_TAG_CLOSE;
re.SIMPLE_EMPTY_ELEMENT_TAG = re.START_TAG_OPEN + re.S + "*" + re.EMPTY_ELEMENT_TAG_CLOSE;
re.END_TAG = "</(" + re.NAME + ")" + re.S + "*>";
re.SINGLE_QUOTE = "'";
re.DOUBLE_QUOTE = "\"";
re.PI_OPEN = "<\\?";
re.PI_CLOSE = "\\?>";
re.CDATA_OPEN = "<\\[CDATA\\[";
re.CDATA_CLOSE = "\\]\\]>";
re.EMPTY = "";

(function () {
    for (var name in re)
        if (re.hasOwnProperty(name))
            re[name] = new RegExp("^" + re[name]);
})();

function doNothing(m, tb) {
    return m;
}

defaultHandler.DATA_CHAR = function (m, tb, str) {
    tb.emitDataChar(str);
    return m;
};

defaultHandler.NAMED_CHAR_REF = function (m, tb, name) {
    var str = lookupCharName(name);
    if (str != null)
	tb.emitDataChar(str);
    else
	tb.emitDataChar("&" + name + ";");
    return m;
};

defaultHandler.NUMERIC_CHAR_REF = function (m, tb, hex) {
    var n = parseInt(hex, 16);
    var str;
    if (n <= 0xFFFF)
	str = String.fromCharCode(n);
    else if (n <= 0x10FFFF) {
	n -= 0x10000;
	str = String.fromCharCode((n >> 10) | 0xD800, (n & 0x3FF) | 0xDC00);
    }
    else
	str = "&#x" + hex + ";";
    tb.emitDataChar(str);
    return m;
};

defaultHandler.START_TAG_CLOSE = function (m, tb) {
    tb.emitStartTagClose();
    return mode.Main;
};

defaultHandler.EMPTY_ELEMENT_TAG_CLOSE = function (m, tb) {
    tb.emitEmptyElementTagClose();
    return mode.Main;
};

function Tokenizer(input, builder) {
    this.input = input;
    this.builder = builder;
    this.mode = mode.Main;
}

Tokenizer.prototype.run = function () {
    while (this.input) {
        this.mode.step(this);
    }
    if ([mode.Tag,
        mode.StartAttributeValue,
        mode.DoubleQuoteAttributeValue,
        mode.SingleQuoteAttributeValue,
        mode.UnquoteAttributeValue].indexOf(this.mode) >= 0)
        this.builder.emitStartTagClose();
};

function Mode() {
    this.on = {};
    this.compiled = false;
}

Mode.prototype.step = function(tokenizer) {
    var bestMatch = null;
    var bestMatchName = null;
    for (var name in this.on) {
        if (this.on.hasOwnProperty(name)) {
            var match = tokenizer.input.match(re[name]);
            if (match != null
                && (bestMatch == null
                    || match[0].length > bestMatch[0].length
                    || (bestMatchName === "DATA_CHAR" && match[0].length == bestMatch[0].length))) {
                bestMatch = match;
                bestMatchName = name;
            }
        }
    }
    if (bestMatch == null)
        throw "Internal error looking at: " + tokenizer.input;
    tokenizer.input = tokenizer.input.slice(bestMatch[0].length);
    tokenizer.mode = this.on[bestMatchName](this, tokenizer.builder, bestMatch[1], bestMatch[2]);
};

mode.Main = new Mode();
mode.Main.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.Main.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.Main.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.Main.on.COMMENT_OPEN = function (m, tb) {
    return mode.Comment;
};
mode.Main.on.SIMPLE_START_TAG = function (m, tb, name) {
    tb.emitStartTagOpen(name).emitStartTagClose();
    return m;
};
mode.Main.on.SIMPLE_EMPTY_ELEMENT_TAG = function (m, tb, name) {
    tb.emitStartTagOpen(name).emitEmptyElementTagClose();
    return m;
};
mode.Main.on.START_TAG_ATTRIBUTE = function (m, tb, elemName, attName) {
    tb.emitStartTagOpen(elemName).emitAttributeName(attName);
    return mode.StartAttributeValue;
};
mode.Main.on.END_TAG = function (m, tb, name) {
    tb.emitEndTag(name);
    return m;
};
mode.Main.on.CDATA_OPEN = function (m, tb, name) { return mode.CData; };
mode.Main.on.PI_OPEN = function(m, tb, name) { return mode.PI; };

mode.Tag = new Mode();
mode.Tag.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.Tag.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.Tag.on.ATTRIBUTE_NAME_EQUALS = function(m, tb, name) {
    tb.emitAttributeName(name);
    return mode.StartAttributeValue;
};
mode.Tag.on.S = doNothing;
mode.Tag.on.EMPTY = function(m, tb) {
    tb.emitStartTagClose();
    return mode.Main;
};

mode.StartAttributeValue = new Mode();
mode.StartAttributeValue.on.S = doNothing;
mode.StartAttributeValue.on.SINGLE_QUOTE = function(m, tb) { return mode.SingleQuoteAttributeValue; };
mode.StartAttributeValue.on.DOUBLE_QUOTE = function(m, tb) { return mode.DoubleQuoteAttributeValue; };
mode.StartAttributeValue.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.StartAttributeValue.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.StartAttributeValue.on.DATA_CHAR = function(m, tb, str) {
    defaultHandler.DATA_CHAR(m, tb, str);
    return mode.UnquoteAttributeValue;
};
mode.StartAttributeValue.on.NAMED_CHAR_REF = function(m, tb, name) {
    defaultHandler.NAMED_CHAR_REF(m, tb, name);
    return mode.UnquoteAttributeValue;
};
mode.StartAttributeValue.on.NUMERIC_CHAR_REF = function(m, tb, hex) {
    defaultHandler.NUMERIC_CHAR_REF(m, tb, hex);
    return mode.UnquoteAttributeValue;
};

mode.UnquoteAttributeValue = new Mode();
mode.UnquoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.UnquoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.UnquoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.UnquoteAttributeValue.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.UnquoteAttributeValue.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.UnquoteAttributeValue.on.S = function(m, tb) { return mode.Tag; };

mode.SingleQuoteAttributeValue = new Mode();
mode.SingleQuoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.SingleQuoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.SingleQuoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.SingleQuoteAttributeValue.on.SINGLE_QUOTE = function(m, tb) { return mode.Tag; };

mode.DoubleQuoteAttributeValue = new Mode();
mode.DoubleQuoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.DoubleQuoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.DoubleQuoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.DoubleQuoteAttributeValue.on.DOUBLE_QUOTE = function(m, tb) { return mode.Tag; };

mode.Comment = new Mode();
mode.Comment.on.DATA_CHAR = doNothing;
mode.Comment.on.COMMENT_CLOSE = function(m, tb) { return mode.Main; };

mode.PI = new Mode();
mode.PI.on.DATA_CHAR = doNothing;
mode.PI.on.PI_CLOSE = function(m, tb) { return mode.Main; };

mode.CData = new Mode();
mode.CData.on.DATA_CHAR = doNothing;
mode.CData.on.CDATA_CLOSE = function(m, tb) { return mode.Main; };

var TreeBuilder = function () {
    this.openElements = [[null, null, []]];
    this.openAttributeName = null;
    this.buffer = [];  
};

TreeBuilder.prototype.addContent = function (content) {
    this.openElements[this.openElements.length - 1][2].push(content);
    return this;
};

TreeBuilder.prototype.addAttribute = function (name, value) {
    var atts = this.openElements[this.openElements.length - 1][1];
    // This is what's needed to work when the name is "__proto__"
    if (typeof(atts[name]) !== "string")
        Object.defineProperty(atts, name, {
	    value: value,
	    enumerable: true,
	    writable: true,
	    configurable: true
	});
    return this;
};

TreeBuilder.prototype.flushData = function () {
    if (this.buffer.length > 0) {
	this.addContent(this.buffer.join(""));
	this.buffer = [];
    }
    return this;
};

TreeBuilder.prototype.flushAttribute = function () {
   if (this.openAttributeName != null) {
       this.addAttribute(this.openAttributeName, this.buffer.join(""));
       this.openAttributeName = null;
       this.buffer = [];
    }
    return this;
};

TreeBuilder.prototype.emitDataChar = function (str) {
    this.buffer.push(str);
    return this;
};

TreeBuilder.prototype.emitStartTagOpen = function (name) {
    var elem = [name, {}, []];
    this.flushData();
    this.addContent(elem);
    this.openElements.push(elem);
    return this;
};

TreeBuilder.prototype.emitStartTagClose = TreeBuilder.prototype.flushAttribute;
 
TreeBuilder.prototype.emitEmptyElementTagClose = function () {
    this.flushAttribute();
    this.openElements.pop();
    return this;
};

TreeBuilder.prototype.emitEndTag = function (name) {
    var i, j;
    this.flushData();
    for (i = this.openElements.length - 1; i > 0; --i) {
	if (this.openElements[i][0] === name) {
	    this.openElements = this.openElements.slice(0, i);
	    break;
	}
    }
    return this;
};

TreeBuilder.prototype.emitAttributeName = function (name) {
    this.flushAttribute();
    this.openAttributeName = name;
    return this;
};

TreeBuilder.prototype.strip = function (content) {
    // TODO
    return content;
};

TreeBuilder.prototype.wrap = function (content) {
    if (content.length == 1 && typeof(content[0]) != "string")
	return content[0];
    else
	return ["#doc",{},content];
};

TreeBuilder.prototype.end = function () {
    this.flushData();
    return this.wrap(this.strip(this.openElements[0][2]));
};

function parseMicroXML(str) {
    var tb = new TreeBuilder();
    new Tokenizer(str, tb).run();
    return tb.end();
}