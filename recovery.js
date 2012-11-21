"use strict";

var TreeBuilder = function () {
    this.openElements = [[null, null, []]];
    this.openAttributeName = null;
    this.buffer = [];  
}

TreeBuilder.prototype.addContent = function (content) {
    return this.openElements[this.openElements.length - 1][2].push(content);
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
};

TreeBuilder.prototype.flushData = function () {
    if (this.buffer.length > 0) {
	this.addContent(this.buffer.join());
	this.buffer = [];
    }
};

TreeBuilder.prototype.flushAttribute = function () {
   if (this.openAttributeName != null) {
       this.addAttribute(this.openAttributeName, this.buffer.join());
       this.openAttributeName = null
       this.buffer = [];
    }
};

TreeBuilder.prototype.emitDataChar = function (str) {
    this.buffer.push(str);
};

TreeBuilder.prototype.emitStartTagOpen = function (name) {
    var elem = [name, {}, []];
    this.flushData();
    this.addContent(elem);
    this.openElements.push(elem);
};

TreeBuilder.prototype.emitStartTagClose = TreeBuilder.prototype.flushAttribute;
 
TreeBuilder.prototype.emitEmptyElementTagClose = function () {
    this.flushAttribute();
    this.openElements.pop();
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
};

TreeBuilder.prototype.emitAttributeName = function (name) {
    this.flushAttribute();
    this.openAttributeName = name;
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
