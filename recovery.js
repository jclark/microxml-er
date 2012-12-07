"use strict";

var mode = {};
var defaultHandler = {};
var re = {};
var charNames = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

re.DATA_CHAR = "([\u0000-\uFFFF])";
re.S = "[\f\t\n ]";
re.NAME_START_CHAR = "[A-Za-z_:$\u0080-\uFFFF]";
re.NAME_CHAR = "[-.0-9" + re.NAME_START_CHAR.slice(1);
re.NAME = re.NAME_START_CHAR + re.NAME_CHAR + "*";
re.NAMED_CHAR_REF = "&(" + re.NAME + ");";
re.NUMERIC_CHAR_REF = "&#(x[0-9A-fA-F]+|[0-9]+);";
re.START_TAG_CLOSE = ">";
re.EMPTY_ELEMENT_TAG_CLOSE = "/>";
re.ATTRIBUTE_NAME_EQUALS = re.S + "*" + "(" + re.NAME + ")" + re.S + "*=";
re.TAG_CONTEXT = "(?=(?:" + re.S + "+" + re.NAME + ")*" + re.S + "*" +
    "(?:" + re.START_TAG_CLOSE + "|" + re.EMPTY_ELEMENT_TAG_CLOSE + "|" + re.S + re.NAME + re.S + "*=)" +
    ")";
re.START_TAG_OPEN = "<(" + re.NAME + ")" + re.TAG_CONTEXT;
re.BOOLEAN_ATTRIBUTE = re.S + "*(" + re.NAME + ")" + re.TAG_CONTEXT;
re.END_TAG = "</(" + re.NAME + ")" + re.S + "*>";
re.SINGLE_QUOTE = "'";
re.DOUBLE_QUOTE = "\"";
re.COMMENT = "<!--(?:[^-]|-[^-]|--[^>])*--+>";
re.PI = "<\\?(?:[^?]|\\?[^>])*\\?+>";
re.CDATA_OPEN = "<!\\[CDATA\\[";
re.CDATA_CLOSE = "\\]\\]>";
re.EMPTY = "";
// For DOCTYPE handling
re.DOCTYPE_OPEN = "<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]";
re.LITERAL = "(?:\"[^\"]*\"|'[^']*')";
re.DECL_CHAR = "[^\\][<>\"']";
re.DECL = "<!(:?" + re.DECL_CHAR + "|" + re.LITERAL + ")*>";
re.SUBSET_CLOSE = "\\]" + re.S + "*>";
re.SUBSET_OPEN = "\\[";

(function () {
    for (var name in re)
        if (re.hasOwnProperty(name))
            re[name] = new RegExp("^" + re[name]);
})();

function doNothing(m, tb) {
    return m;
}

function changeMode(m) {
    return function (curMode, tb) {
        return m;
    };
}

defaultHandler.DATA_CHAR = function (m, tb, str) {
    tb.emitDataChar(str);
    return m;
};

defaultHandler.NAMED_CHAR_REF = function (m, tb, name) {
    var str = charNames[name];
    if (str)
	tb.emitDataChar(str);
    else
	tb.emitDataChar("&" + name + ";");
    return m;
};

defaultHandler.NUMERIC_CHAR_REF = function (m, tb, ref) {
    var n;
    if (ref[0] == "x")
        n = parseInt(ref.substr(1), 16);
    else
        n = parseInt(ref, 10);
    var str;
    if (n <= 0xFFFF)
	str = String.fromCharCode(n);
    else if (n <= 0x10FFFF) {
	n -= 0x10000;
	str = String.fromCharCode((n >> 10) | 0xD800, (n & 0x3FF) | 0xDC00);
    }
    else
	str = "&#" + ref + ";";
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
    return this.builder;
};

Tokenizer.prototype.preprocess = function () {
    this.input = this.input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    return this;
};

function Mode() {
    this.on = {};
}

Mode.prototype.step = function(tokenizer) {
    var bestMatch = null;
    var bestMatchName = null;
    for (var name in this.on) {
        if (this.on.hasOwnProperty(name)) {
            var match = tokenizer.input.match(re[name]);
            if (match !== null
                && (bestMatch === null
                    || match[0].length > bestMatch[0].length
                    || (bestMatchName === "DATA_CHAR" && match[0].length === bestMatch[0].length))) {
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

// Define modes here so we can refer to them in changeMode.
mode.Main = new Mode();
mode.Tag = new Mode();
mode.StartAttributeValue = new Mode();
mode.UnquoteAttributeValue = new Mode();
mode.SingleQuoteAttributeValue = new Mode();
mode.DoubleQuoteAttributeValue = new Mode();
mode.CData = new Mode();
mode.Doctype = new Mode();
mode.Subset = new Mode();

mode.Main.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.Main.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.Main.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.Main.on.COMMENT = doNothing;
mode.Main.on.START_TAG_OPEN = function (m, tb, name) {
    tb.emitStartTagOpen(name);
    return mode.Tag;
};
mode.Main.on.END_TAG = function (m, tb, name) {
    tb.emitEndTag(name);
    return m;
};
mode.Main.on.CDATA_OPEN = changeMode(mode.CData);
mode.Main.on.PI = doNothing;
mode.Main.on.DOCTYPE_OPEN = changeMode(mode.Doctype);

mode.Tag.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.Tag.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.Tag.on.ATTRIBUTE_NAME_EQUALS = function(m, tb, name) {
    tb.emitAttributeName(name);
    return mode.StartAttributeValue;
};
mode.Tag.on.BOOLEAN_ATTRIBUTE = function(m, tb, name) {
    tb.emitAttributeName(name);
    return m;
};
mode.Tag.on.S = doNothing;
mode.Tag.on.EMPTY = function(m, tb) {
    tb.emitStartTagClose();
    return mode.Main;
};

mode.StartAttributeValue.on.S = doNothing;
mode.StartAttributeValue.on.SINGLE_QUOTE = changeMode(mode.SingleQuoteAttributeValue);
mode.StartAttributeValue.on.DOUBLE_QUOTE = changeMode(mode.DoubleQuoteAttributeValue);
mode.StartAttributeValue.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.StartAttributeValue.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.StartAttributeValue.on.EMPTY = changeMode(mode.UnquoteAttributeValue);

mode.UnquoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.UnquoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.UnquoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.UnquoteAttributeValue.on.START_TAG_CLOSE = defaultHandler.START_TAG_CLOSE;
mode.UnquoteAttributeValue.on.EMPTY_ELEMENT_TAG_CLOSE = defaultHandler.EMPTY_ELEMENT_TAG_CLOSE;
mode.UnquoteAttributeValue.on.S = changeMode(mode.Tag);

mode.SingleQuoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.SingleQuoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.SingleQuoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.SingleQuoteAttributeValue.on.SINGLE_QUOTE = changeMode(mode.Tag);

mode.DoubleQuoteAttributeValue.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.DoubleQuoteAttributeValue.on.NAMED_CHAR_REF = defaultHandler.NAMED_CHAR_REF;
mode.DoubleQuoteAttributeValue.on.NUMERIC_CHAR_REF = defaultHandler.NUMERIC_CHAR_REF;
mode.DoubleQuoteAttributeValue.on.DOUBLE_QUOTE = changeMode(mode.Tag);

mode.CData.on.DATA_CHAR = defaultHandler.DATA_CHAR;
mode.CData.on.CDATA_CLOSE = changeMode(mode.Main);

mode.Doctype.on.DECL_CHAR = doNothing;
mode.Doctype.on.LITERAL = doNothing;
mode.Doctype.on.SUBSET_OPEN = changeMode(mode.Subset);
mode.Doctype.on.START_TAG_CLOSE = changeMode(mode.Main);
mode.Doctype.on.EMPTY = changeMode(mode.Main);

mode.Subset.on.PI = doNothing;
mode.Subset.on.COMMENT = doNothing;
mode.Subset.on.S = doNothing;
mode.Subset.on.DECL = doNothing;
mode.Subset.on.SUBSET_CLOSE = changeMode(mode.Main);
mode.Subset.on.EMPTY = changeMode(mode.Main);

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
    var i;
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
    var str = content[0];
    if (typeof(str) === "string") {
        str = str.replace(/^[ \f\r\t\n]*/, "");
        if (str === "")
            content.splice(0, 1);
        else
            content[0] = str;
    }
    str = content[content.length - 1];
    if (typeof(str) === "string") {
        str = str.replace(/[ \f\r\t\n]*$/, "");
        if (str === "")
            content.pop();
        else
            content[content.length - 1] = str;
    }
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
    return new Tokenizer(str, new TreeBuilder()).preprocess().run().end();
}